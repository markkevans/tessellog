import type { ObjectStore } from "@tessellog/driver-object-store";
import type { R2BucketLike } from "./bindings.js";

const DELETE_BATCH = 1000;

export const createR2ObjectStore = ({ bucket }: { readonly bucket: R2BucketLike }): ObjectStore => ({
  get: async (key) => {
    const object = await bucket.get(key);
    return object === null ? undefined : new Uint8Array(await object.arrayBuffer());
  },
  put: async (key, data) => {
    await bucket.put(key, data);
  },
  delete: async (key) => {
    await bucket.delete(key);
  },
  deleteMany: async (keys) => {
    await Promise.all(
      Array.from({ length: Math.ceil(keys.length / DELETE_BATCH) }, (_, i) =>
        bucket.delete(keys.slice(i * DELETE_BATCH, (i + 1) * DELETE_BATCH)),
      ),
    );
  },
});
