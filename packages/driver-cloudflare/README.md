# @tessellog/driver-cloudflare

A tessellog driver for Cloudflare:
- R2 holds tiles, bundles and the checkpoint.
- D1 holds sequencing, tree state, the single-writer lease and antispam.

It needs neither `nodejs_compat` nor `@cloudflare/workers-types`.

```sh
npm install @tessellog/driver-cloudflare @tessellog/appender
```

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

## API

- `openCloudflareDriver({ bucket, db, leaseDuration?, entriesPath? })` returns a `LogDriver` with `close()`.
- `createD1AntispamStore({ db })` returns an `AntispamStore`.
- `createR2ObjectStore` and `createD1Coordinator` are the parts, for use with `@tessellog/driver-object-store`.
- `R2BucketLike` and `D1DatabaseLike` are structural binding types.

Run the appender in a Durable Object, which is the natural single writer. Indices are exact up to 2^63 − 1.

Guide: [choosing a storage driver](https://github.com/markkevans/tessellog/blob/main/docs/guides/drivers.md). Example: [`cloudflare-worker`](https://github.com/markkevans/tessellog/tree/main/examples/cloudflare-worker).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
