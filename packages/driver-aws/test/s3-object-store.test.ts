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
