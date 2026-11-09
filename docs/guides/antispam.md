# Antispam and deduplication

Without antispam, adding the same entry twice gives it two indices. That is often fine. But for logs that anyone can write to, or whose clients retry, duplicates waste space and can be used to bloat the log. Antispam makes a repeated entry return the index it already has.

## Turning it on

<!-- snippet: antispam/deduplicate.ts -->
```ts
import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixAntispamStore, openPosixDriver } from "@tessellog/driver-posix";

export const deduplicatingAppender = async (signer: NoteSigner) => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const appender = createAppender({
    driver,
    signer,
    antispam: {
      inMemoryEntries: 256 * 1024,
      store: await openPosixAntispamStore({ root: "./my-log-antispam" }),
    },
  });

  const entry = new TextEncoder().encode("the same thing twice");
  const first = await appender.add(entry);
  const second = await appender.add(entry);
  console.log(first.index === second.index, second.isDup);
  return appender;
};
```

A duplicate resolves with the original index and `isDup: true`. It is not sequenced again.

## How it works

Antispam is layered and best-effort, as in Tessera ([ADR 6](../adr/0006-layered-best-effort-antispam.md)):

1. **In memory.** A bounded index of recently added entries (`inMemoryEntries`, 262,144 by default). It catches retries and bursts at no I/O cost. `antispam: {}` turns on this layer alone.
2. **Persistent.** An optional `AntispamStore` that remembers every integrated entry. A **follower** reads newly integrated bundles in the background and records each entry's identity and index. The store only knows entries the follower has reached, so a duplicate that arrives within moments of the original may still get a new index. That is why it is best-effort.

If the follower falls more than `pushbackThreshold` entries (2,048) behind the tree, `add` throws `PushbackAntispamError` until it catches up.

An entry's **identity** comes from the layout: SHA-256 of the entry for tlog-tiles. For static CT it is SHA-256 of the certificate, or of the precertificate for a precert entry, so a certificate resubmitted with a new timestamp still counts as a duplicate.

## Stores

| Store | Package |
|---|---|
| `createMemoryAntispamStore()` | `@tessellog/appender` (tests) |
| `openPosixAntispamStore({ root })` | `@tessellog/driver-posix` |
| `createDynamoAntispamStore({ client, table })` | `@tessellog/driver-aws` |
| `createD1AntispamStore({ db })` | `@tessellog/driver-cloudflare` |

Your own store implements three methods:
- `lookup(identity)` returns the first index recorded for the identity.
- `record(entries, followedSize)` records new identities, keeps the first index for each, and advances progress.
- `followedSize()` reports progress.

Check it with `describeAntispamStore` from `@tessellog/driver-conformance`.

## Migration

`createMigrationTarget({ driver, antispam })` fills an antispam store while copying a log in, so the new log deduplicates against the entries it inherited. See [Operating a log](./operations.md#migrating-a-log).
