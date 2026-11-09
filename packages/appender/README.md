# @tessellog/appender

The write path of a tessellog log:
- batching and sequencing;
- background integration into tiles;
- signed checkpoint publication;
- pushback and graceful shutdown;
- antispam and witnessing;
- migration and garbage collection.

```sh
npm install @tessellog/appender @tessellog/core
```

<!-- snippet: operations/shutdown.ts -->
```ts
import { createAppender, createLogReader } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

export const runUntilSignalled = async (signer: NoteSigner) => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const appender = createAppender({
    driver,
    signer,
    batching: { maxSize: 256, maxAge: 250 },
    checkpointInterval: 1_000,
    garbageCollection: { interval: 60_000 },
    onError: (error) => console.error("background task failed", error),
  });

  process.once("SIGTERM", async () => {
    await appender.shutdown();
    await driver.close();
  });
  return appender;
};

export const freeze = async () => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const reader = createLogReader({ driver });
  console.log(`frozen at ${await reader.integratedSize()} entries`);
  return reader;
};
```

## API

- `createAppender(options)` returns an `Appender` with these members:
  - `add(entry)` resolves with `{ index, isDup }` once the index is durable.
  - `awaitPublication(index)` resolves with the first published checkpoint that covers the index.
  - `shutdown()`.
  - `reader`, which is also a client fetcher.
- `createLogReader({ driver })` gives read-only access to a log that has stopped growing.
- `createMigrationTarget({ driver, antispam?, layout? })` copies a log in from its entry bundles and checks the root.
- `createMemoryDriver()` and `createMemoryAntispamStore()` are for tests.
- `tlogTilesLayout`, the default `EntryLayout`.
- Errors: `PushbackError`, `PushbackAntispamError` and `EntryTooLargeError`.
- Types: `LogDriver`, `AntispamStore`, `AppenderOptions` and `EntryLayout`, for writing your own drivers and stores.

### Options

| Option | Default |
|---|---|
| `driver`, `signer` | required |
| `additionalSigners` | `[]`, all named like `signer` |
| `origin` | `signer.name` |
| `batching` | `{ maxSize: 256, maxAge: 250 }` |
| `checkpointInterval` / `checkpointRepublishInterval` | `10_000` / `600_000` ms |
| `pushback` | `{ maxOutstanding: 4096 }` |
| `antispam` | off; `{ inMemoryEntries: 262144, store?, pushbackThreshold: 2048 }` |
| `witnessing` | off; `{ policy, timeout: 1000, failOpen: false, fetch? }` |
| `garbageCollection` | `{ interval: 60_000 }` |
| `layout` | `tlogTilesLayout` |
| `onError` | logs to the console |

Guides: [concepts](https://github.com/markkevans/tessellog/blob/main/docs/guides/concepts.md), [operations](https://github.com/markkevans/tessellog/blob/main/docs/guides/operations.md), [antispam](https://github.com/markkevans/tessellog/blob/main/docs/guides/antispam.md) and [witnessing](https://github.com/markkevans/tessellog/blob/main/docs/guides/witnessing.md).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
