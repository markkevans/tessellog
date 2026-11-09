import { createAppender, createMemoryDriver, createMigrationTarget } from "@tessellog/appender";
import { leafHash, rootHash } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { createTessellogTable, openAwsDriver } from "../src/index.js";
import { flociDynamo, flociS3, freshBucket, freshTableName } from "./fixtures/floci.js";
import { logSigner } from "./fixtures/keys.js";

describe("migrating a log onto AWS", () => {
  it("reproduces the source root on S3 and DynamoDB and accepts new entries", async () => {
    const added = Array.from({ length: 300 }, (_, i) => new TextEncoder().encode(`entry ${i}`));
    const source = createMemoryDriver();
    const sourceAppender = createAppender({ driver: source, signer: logSigner(), batching: { maxSize: 256, maxAge: 0 } });
    await Promise.all(added.map((entry) => sourceAppender.add(entry)));
    await sourceAppender.shutdown();
    const s3 = flociS3();
    const dynamo = flociDynamo();
    const table = freshTableName();
    await createTessellogTable({ client: dynamo, table });
    const target = await openAwsDriver({ s3, bucket: await freshBucket(s3), dynamo, table });
    const migrated = await createMigrationTarget({ driver: target }).migrate({
      readEntryBundle: (address) => source.readEntryBundle(address),
      sourceSize: 300n,
      sourceRoot: rootHash(added.map(leafHash)),
    });
    const appender = createAppender({ driver: target, signer: logSigner(), batching: { maxSize: 1 } });
    const next = await appender.add(new TextEncoder().encode("after migration"));
    await appender.shutdown();
    await target.close();
    s3.destroy();
    dynamo.destroy();
    expect(migrated.ok).toBe(true);
    expect(next.index).toBe(300n);
  }, 30_000);
});
