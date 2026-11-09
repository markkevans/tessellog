import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { generateNoteKey, parseSignerKey, parseVerifierKey, type Result } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { prepareAwsLog, startAwsLog, type AwsLog, type AwsLogOptions } from "../src/index.js";

const ENDPOINT = process.env["FLOCI_ENDPOINT"] ?? "http://127.0.0.1:4566";
const ORIGIN = "example.com/aws-log";
const config = {
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
};

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const freshResources = () => {
  const name = `tessellog-example-${randomUUID()}`;
  return {
    s3: new S3Client({ ...config, forcePathStyle: true }),
    dynamo: new DynamoDBClient(config),
    bucket: name,
    table: name,
  };
};

const freshLog = async (): Promise<{ options: AwsLogOptions; verifierKey: string }> => {
  const resources = freshResources();
  await prepareAwsLog(resources);
  const { signerKey, verifierKey } = unwrap(generateNoteKey({ name: ORIGIN }));
  return {
    options: {
      ...resources,
      signer: unwrap(parseSignerKey(signerKey)),
      port: 0,
      appender: { checkpointInterval: 50 },
    },
    verifierKey,
  };
};

const add = async (log: AwsLog, text: string): Promise<bigint> => {
  const response = await fetch(new URL("add", log.url), { method: "POST", body: text });
  expect(response.status).toBe(200);
  return BigInt(await response.text());
};

describe("a log service on S3 and DynamoDB", () => {
  it("adds entries through the service and proves them by reading S3 directly", async () => {
    const { options, verifierKey } = await freshLog();
    const log = await startAwsLog(options);
    const texts = ["alpha", "bravo", "charlie"];
    const indices = await Promise.all(texts.map((text) => add(log, text)));
    await log.close();
    const client = createLogClient({
      fetcher: createHttpFetcher({ baseUrl: `${ENDPOINT}/${options.bucket}/` }),
      origin: ORIGIN,
      logVerifier: unwrap(parseVerifierKey(verifierKey)),
    });
    const { checkpoint } = unwrap(await client.latestCheckpoint());
    expect(checkpoint.size).toBe(3n);
    const proofs = await Promise.all(
      texts.map((text, i) =>
        client.proveInclusion({ entry: new TextEncoder().encode(text), index: indices[i] ?? -1n, checkpoint }),
      ),
    );
    expect(proofs.every(({ ok }) => ok)).toBe(true);
  });

  it("refuses to start a second writer while the first holds the lease", async () => {
    const { options } = await freshLog();
    const first = await startAwsLog(options);
    await expect(startAwsLog(options)).rejects.toThrow(/held by another writer/);
    await first.close();
    const second = await startAwsLog(options);
    expect(await add(second, "after takeover")).toBe(0n);
    await second.close();
  });

  it("prepares the bucket and table idempotently", async () => {
    const resources = freshResources();
    await prepareAwsLog(resources);
    await expect(prepareAwsLog(resources)).resolves.toBeUndefined();
  });

  it("reports any other failure to prepare", async () => {
    await expect(prepareAwsLog({ ...freshResources(), table: "!" })).rejects.toThrow();
  });
});
