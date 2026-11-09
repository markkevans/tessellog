import { describeObjectStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { createS3ObjectStore } from "../src/index.js";
import { flociS3, freshBucket } from "./fixtures/floci.js";

describeObjectStore("the S3 object store on Floci", async () => {
  const client = flociS3();
  const bucket = await freshBucket(client);
  return { subject: createS3ObjectStore({ client, bucket }), cleanup: async () => client.destroy() };
});

describe("surfacing S3 failures", () => {
  it("passes on errors other than a missing key", async () => {
    const client = flociS3();
    const store = createS3ObjectStore({ client, bucket: "tessellog-bucket-that-does-not-exist" });
    await expect(store.get("checkpoint")).rejects.toThrow();
    client.destroy();
  });
});

describe("surfacing failed S3 batch deletes", () => {
  it("reports objects S3 could not delete", async () => {
    const client = flociS3();
    const store = createS3ObjectStore({ client, bucket: await freshBucket(client) });
    client.middlewareStack.add(
      (next) => async (args) => {
        const result = await next(args);
        return { ...result, output: { ...result.output, Errors: [{ Key: "tile/0/000.p/1", Code: "AccessDenied" }] } };
      },
      { step: "initialize" },
    );
    await expect(store.deleteMany(["tile/0/000.p/1"])).rejects.toThrow(
      "could not delete 1 objects, first tile/0/000.p/1: AccessDenied",
    );
    client.destroy();
  });
});
