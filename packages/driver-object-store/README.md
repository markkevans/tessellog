# @tessellog/driver-object-store

Builds a full tessellog `LogDriver` from three parts:
- an `ObjectStore` (get, put, delete, deleteMany);
- a `Coordinator` (atomic sequencing and compare-and-swap tree state);
- optionally, a `Lease` for a single writer.

The AWS and Cloudflare drivers are built this way, and so can drivers for other clouds and databases be.

```sh
npm install @tessellog/driver-object-store @tessellog/appender
```

<!-- snippet: drivers/object-store.ts -->
```ts
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
```

## API

- `createObjectStoreDriver({ objects, coordinator, entriesPath? })` and `createLeasedDriver({ objects, coordinator, lease, entriesPath? })`.
- The contracts: `ObjectStore`, `Coordinator` and `Lease`.
- `createMemoryObjectStore` and `createMemoryCoordinator`, for tests.
- `encodeEntries` and `decodeEntries`, the framing for sequenced batches.

Check your parts with `describeObjectStore` and `describeCoordinator` from `@tessellog/driver-conformance`.

Guide: [choosing a storage driver](https://github.com/markkevans/tessellog/blob/main/docs/guides/drivers.md#writing-your-own-driver).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
