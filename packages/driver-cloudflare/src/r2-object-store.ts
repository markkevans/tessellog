import type { ObjectStore } from "@tessellog/driver-object-store";
import type { R2BucketLike } from "./bindings.js";

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
});
