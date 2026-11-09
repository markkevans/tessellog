import { describeCoordinator } from "@tessellog/driver-conformance";
import { DeleteTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { describe, expect, it } from "vitest";
import { createDynamoCoordinator, createS3ObjectStore, createTessellogTable } from "../src/index.js";
import { flociDynamo, flociS3, freshBucket, freshTableName } from "./fixtures/floci.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const freshStores = async () => {
  const s3 = flociS3();
  const dynamo = flociDynamo();
  const table = freshTableName();
  await createTessellogTable({ client: dynamo, table });
  const payloads = createS3ObjectStore({ client: s3, bucket: await freshBucket(s3) });
  return {
    dynamo,
    table,
    payloads,
    cleanup: async () => {
      s3.destroy();
      dynamo.destroy();
    },
  };
};

describeCoordinator("the DynamoDB coordinator on Floci", async () => {
  const { dynamo, table, payloads, cleanup } = await freshStores();
  return { subject: await createDynamoCoordinator({ client: dynamo, table, payloads }), cleanup };
});

describe("sharing DynamoDB coordination state", () => {
  it("lets a second coordinator on the same table continue where the first stopped", async () => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const first = await createDynamoCoordinator({ client: dynamo, table, payloads });
    await first.sequence([bytes("a"), bytes("b")]);
    await first.advanceTreeState(0n, { size: 2n, rootHash: new Uint8Array(32).fill(4) });
    const second = await createDynamoCoordinator({ client: dynamo, table, payloads });
    expect(await second.sequence([bytes("c")])).toBe(2n);
    expect(await second.readSequenced(0n)).toEqual([bytes("a"), bytes("b"), bytes("c")]);
    expect(await second.readTreeState()).toEqual({ size: 2n, rootHash: new Uint8Array(32).fill(4) });
    await cleanup();
  });

  it("reads sequenced batches across result pages", async () => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const coordinator = await createDynamoCoordinator({ client: dynamo, table, payloads, pageSize: 1 });
    await coordinator.sequence([bytes("a")]);
    await coordinator.sequence([bytes("b")]);
    await coordinator.sequence([bytes("c")]);
    expect(await coordinator.readSequenced(0n)).toEqual([bytes("a"), bytes("b"), bytes("c")]);
    await cleanup();
  });

  it("passes on DynamoDB errors other than a lost race", async () => {
    const { dynamo, payloads, cleanup } = await freshStores();
    await expect(
      createDynamoCoordinator({ client: dynamo, table: "tessellog-table-that-does-not-exist", payloads }),
    ).rejects.toThrow();
    await cleanup();
  });
});

describe("refusing damaged sequencing state", () => {
  it("fails when a batch's stored entries are missing", async () => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const coordinator = await createDynamoCoordinator({
      client: dynamo,
      table,
      payloads: { ...payloads, get: async () => undefined },
    });
    await coordinator.sequence([bytes("a")]);
    await expect(coordinator.readSequenced(0n)).rejects.toThrow(/missing sequenced batch/);
    await cleanup();
  });

  it.each([
    ["an entry longer than the batch", Uint8Array.of(0, 0, 0, 9, 1)],
    ["a truncated length prefix", Uint8Array.of(0, 0)],
  ])("fails when a batch's stored entries hold %s", async (_, stored) => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const coordinator = await createDynamoCoordinator({
      client: dynamo,
      table,
      payloads: { ...payloads, get: async () => stored },
    });
    await coordinator.sequence([bytes("a")]);
    await expect(coordinator.readSequenced(0n)).rejects.toThrow(/corrupt sequenced batch/);
    await cleanup();
  });

  it("fails rather than restarting from zero when the counter item is damaged", async () => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const coordinator = await createDynamoCoordinator({ client: dynamo, table, payloads });
    await dynamo.send(
      new PutItemCommand({ TableName: table, Item: { pk: { S: "counter" }, sk: { N: "0" } } }),
    );
    await expect(coordinator.sequence([bytes("a")])).rejects.toThrow();
    await cleanup();
  });

  it("stops retrying when a sequencing transaction fails for a reason other than a lost race", async () => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const coordinator = await createDynamoCoordinator({ client: dynamo, table, payloads });
    dynamo.middlewareStack.add(
      (next) => async (args) => {
        if (typeof args.input === "object" && args.input !== null && "TransactItems" in args.input) {
          throw Object.assign(new Error("Rate exceeded"), { name: "ThrottlingException" });
        }
        return next(args);
      },
      { step: "initialize" },
    );
    await expect(coordinator.sequence([bytes("a")])).rejects.toThrow("Rate exceeded");
    await cleanup();
  });

  it("passes on errors other than a lost race when sequencing and advancing", async () => {
    const { dynamo, table, payloads, cleanup } = await freshStores();
    const coordinator = await createDynamoCoordinator({ client: dynamo, table, payloads });
    await dynamo.send(new DeleteTableCommand({ TableName: table }));
    await expect(coordinator.sequence([bytes("a")])).rejects.toThrow();
    await expect(
      coordinator.advanceTreeState(0n, { size: 1n, rootHash: new Uint8Array(32) }),
    ).rejects.toThrow();
    await cleanup();
  });
});
