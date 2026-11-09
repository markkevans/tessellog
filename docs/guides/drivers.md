# Choosing a storage driver

A driver is where a log lives. Every driver stores the public files (checkpoint, tiles, entry bundles) at their tlog-tiles paths. It also keeps a little private state:
- sequenced batches that have not been integrated yet;
- the tree state;
- for cloud drivers, a single-writer lease.

| Driver | Package | Public files | Private state | Good for |
|---|---|---|---|---|
| Memory | `@tessellog/appender` (`createMemoryDriver`) | in memory | in memory | tests, demos |
| POSIX | `@tessellog/driver-posix` | a directory | `.state/` in that directory | one machine; serve with any web server |
| AWS | `@tessellog/driver-aws` | S3 | DynamoDB | production on AWS, reads from S3 or CloudFront |
| Cloudflare | `@tessellog/driver-cloudflare` | R2 | D1 | Workers and Durable Objects, reads from R2 |
| Your own | `@tessellog/driver-object-store` | any object store | any coordinator | other clouds and databases |

Every driver passes the same [conformance suite](#testing-a-driver).

## One writer at a time

A log has exactly one writer. Two appenders sequencing into the same log would interleave their batches correctly, but integration assumes a single integrator. Each driver enforces this:
- **POSIX:** a lock file, `.state/lock`. A second `openPosixDriver` on the directory fails until the first calls `close()`. If a process crashed, delete the lock only once you are sure no writer is running.
- **AWS and Cloudflare:** a lease row (60 seconds by default, `leaseDuration`), renewed as the writer works. A second writer fails with `log is held by another writer` until the lease is released by `close()` or expires. A crashed writer's lease simply expires.

The lease is fail-fast protection. Correctness does not rest on it: sequencing uses conditional transactions, and the tree state only advances by compare-and-swap.

## POSIX

<!-- snippet: quickstart/posix-log.ts -->
```ts
import { readFile } from "node:fs/promises";
import { createAppender } from "@tessellog/appender";
import { parseSignerKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const signer = parseSignerKey((await readFile("log.key", "utf8")).trim());
if (!signer.ok) throw new Error(signer.error);

const driver = await openPosixDriver({ root: "./my-log" });
const appender = createAppender({ driver, signer: signer.value });

const added = await Promise.all(
  ["first", "second", "third"].map((text) => appender.add(new TextEncoder().encode(text))),
);
console.log(added.map(({ index }) => index));

await appender.shutdown();
await driver.close();
```

Files are written atomically: written to a temporary file, flushed with `fsync`, then renamed. A crash never leaves a torn tile. Serve the directory with nginx, Caddy or a CDN, but **do not serve `.state/`**. The [`http-log`](../../examples/http-log) example serves it through `@tessellog/http` instead.

The same package provides `openPosixAntispamStore` and `openPosixWitnessStore`.

## AWS: S3 and DynamoDB

<!-- snippet: drivers/aws.ts -->
```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { createTessellogTable, openAwsDriver } from "@tessellog/driver-aws";

export const openLogOnAws = async (signer: NoteSigner) => {
  const dynamo = new DynamoDBClient({ region: "eu-west-2" });
  await createTessellogTable({ client: dynamo, table: "my-log" });

  const driver = await openAwsDriver({
    s3: new S3Client({ region: "eu-west-2" }),
    bucket: "my-log-tiles",
    dynamo,
    table: "my-log",
  });
  return { driver, appender: createAppender({ driver, signer }) };
};
```

- **Table.** `createTessellogTable` creates the single DynamoDB table: string `pk`, numeric `sk`, on-demand billing. Create it once, ideally in your infrastructure code. It fails if the table already exists.
- **Sequencing.** One `TransactWriteItems` call advances the counter and records the batch together. A crash can leave an unused batch object in S3, but never a gap in the indices.
- **Reads.** Point clients at the bucket, or at CloudFront in front of it. Make `checkpoint` and `tile/` public and keep `.state/` private. The [`aws-log`](../../examples/aws-log) example has the service take only writes, while its clients verify straight from S3.
- **Antispam.** `createDynamoAntispamStore({ client, table })` stores identities in the same table.
- **IAM.** The writer needs `s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on the bucket, plus `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query` and `TransactWriteItems` on the table.

## Cloudflare: R2 and D1

<!-- snippet: drivers/cloudflare.ts -->
```ts
import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openCloudflareDriver, type D1DatabaseLike, type R2BucketLike } from "@tessellog/driver-cloudflare";

type Env = { readonly LOG_BUCKET: R2BucketLike; readonly LOG_DB: D1DatabaseLike };

export const openLogOnCloudflare = async (env: Env, signer: NoteSigner) => {
  const driver = await openCloudflareDriver({ bucket: env.LOG_BUCKET, db: env.LOG_DB, leaseDuration: 15_000 });
  return { driver, appender: createAppender({ driver, signer }) };
};
```

- **Where the appender runs.** Run it in a **Durable Object**, not in a stateless Worker. The Durable Object is the natural single writer, and stays alive while requests wait for publication. The [`cloudflare-worker`](../../examples/cloudflare-worker) example has a Worker route every request to one Durable Object, which serves the log through `@tessellog/http`. The example is tested in Node and, bundled, on workerd.
- **Lease duration.** Durable Objects can be evicted without warning. A shorter `leaseDuration` (such as 15 seconds) lets a fresh instance take over sooner.
- **Bindings.** The bindings are typed structurally (`R2BucketLike`, `D1DatabaseLike`), so the driver needs neither `nodejs_compat` nor `@cloudflare/workers-types`.
- **Index range.** D1 integers cross the boundary as decimal text, so indices are exact up to 2^63 − 1.

## Writing your own driver

Most cloud stores are an object store plus something that can do a conditional write. `@tessellog/driver-object-store` turns those into a full driver:

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

The `Coordinator` is the hard part. It must:
- Give each `sequence(entries)` a contiguous range of indices, atomically and durably. An empty batch reserves nothing and returns the next index.
- Return sequenced entries from any index at or after the integrated size, in order.
- Advance the tree state only from an expected size (compare-and-swap).
- Forget batches that lie wholly below a size.

For anything else, implement `LogDriver` directly. It has nine methods: `sequence`, `readSequenced`, `readTreeState`, `readTile`, `readEntryBundle`, `writeIntegration`, `readCheckpoint`, `writeCheckpoint` and `collectGarbage`. [ADR 5](../adr/0005-log-driver-contract.md) explains the contract.

## Testing a driver

`@tessellog/driver-conformance` holds the suites every built-in driver passes. Run them against yours in Vitest:

<!-- snippet: drivers/conformance.ts -->
```ts
import { createMemoryDriver } from "@tessellog/appender";
import { describeLogDriver } from "@tessellog/driver-conformance";

describeLogDriver("my driver", async () => {
  const driver = createMemoryDriver();
  return { driver, cleanup: async () => undefined };
});
```

There are also `describeObjectStore`, `describeCoordinator`, `describeAntispamStore` and `describeWitnessStore`. Give each test a fresh, empty store, and release it in `cleanup`.
