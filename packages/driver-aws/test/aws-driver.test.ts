import { DeleteTableCommand } from "@aws-sdk/client-dynamodb";
import { describeLogDriver } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { createTessellogTable, openAwsDriver, type AwsDriverOptions } from "../src/index.js";
import { flociDynamo, flociS3, freshBucket, freshTableName } from "./fixtures/floci.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const freshLog = async () => {
  const s3 = flociS3();
  const dynamo = flociDynamo();
  const table = freshTableName();
  await createTessellogTable({ client: dynamo, table });
  const options: AwsDriverOptions = { s3, bucket: await freshBucket(s3), dynamo, table };
  return {
    options,
    dynamo,
    table,
    destroy: () => {
      s3.destroy();
      dynamo.destroy();
    },
  };
};

describeLogDriver("the AWS driver on Floci", async () => {
  const { options, destroy } = await freshLog();
  const driver = await openAwsDriver(options);
  return {
    driver,
    cleanup: async () => {
      await driver.close();
      destroy();
    },
  };
});

describe("running an AWS log across restarts", () => {
  it("continues sequencing after reopening", async () => {
    const { options, destroy } = await freshLog();
    const first = await openAwsDriver(options);
    await first.sequence([bytes("a"), bytes("b")]);
    await first.close();
    const second = await openAwsDriver(options);
    expect(await second.sequence([bytes("c")])).toBe(2n);
    await second.close();
    destroy();
  });
});

describe("allowing one writer per AWS log", () => {
  it("refuses a second driver while the first holds the lease", async () => {
    const { options, destroy } = await freshLog();
    const first = await openAwsDriver(options);
    await expect(openAwsDriver(options)).rejects.toThrow(/log is held by another writer/);
    await first.close();
    destroy();
  });

  it("allows a new driver once the first has closed", async () => {
    const { options, destroy } = await freshLog();
    await (await openAwsDriver(options)).close();
    await (await openAwsDriver(options)).close();
    destroy();
  });

  it("lets a new writer take over an expired lease, and the old writer then fails", async () => {
    const { options, destroy } = await freshLog();
    const stale = await openAwsDriver({ ...options, leaseDuration: 1_000, clock: () => 0 });
    const takeover = await openAwsDriver({ ...options, leaseDuration: 1_000, clock: () => 5_000 });
    await expect(
      stale.writeIntegration({ size: 0n, rootHash: new Uint8Array(32), tiles: [], bundles: [] }),
    ).rejects.toThrow("lost the single-writer lease");
    await takeover.close();
    destroy();
  });

  it("passes on DynamoDB errors other than a held lease", async () => {
    const { options, dynamo, table, destroy } = await freshLog();
    const driver = await openAwsDriver(options);
    await dynamo.send(new DeleteTableCommand({ TableName: table }));
    await expect(
      driver.writeIntegration({ size: 0n, rootHash: new Uint8Array(32), tiles: [], bundles: [] }),
    ).rejects.toThrow();
    await expect(driver.close()).rejects.toThrow();
    destroy();
  });
});
