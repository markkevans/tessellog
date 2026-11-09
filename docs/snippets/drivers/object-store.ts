import { createLeasedDriver, type Coordinator, type Lease, type ObjectStore } from "@tessellog/driver-object-store";

type Bucket = {
  readonly read: (key: string) => Promise<Uint8Array | undefined>;
  readonly write: (key: string, value: Uint8Array) => Promise<void>;
  readonly remove: (keys: readonly string[]) => Promise<void>;
};

export const bucketStore = (bucket: Bucket): ObjectStore => ({
  get: (key) => bucket.read(key),
  put: (key, value) => bucket.write(key, value),
  delete: (key) => bucket.remove([key]),
  deleteMany: (keys) => bucket.remove(keys),
});

export const openDriver = (bucket: Bucket, coordinator: Coordinator, lease: Lease) =>
  createLeasedDriver({ objects: bucketStore(bucket), coordinator, lease });
