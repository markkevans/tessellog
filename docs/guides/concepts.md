# Concepts

## What a transparency log gives you

A transparency log is an append-only list of entries, such as software releases, certificates, key bindings or audit events. It is organised as a Merkle tree, so the operator can **prove** two things to anyone:

- **Inclusion:** an entry is in the log at a given index.
- **Consistency:** today's log contains yesterday's log unchanged, with only new entries added at the end.

Proofs are checked against a **checkpoint**, a small signed note that commits to the tree's size and root hash. A client that remembers a checkpoint can detect a log that rewrites history. A client that compares checkpoints with others, directly or through **witnesses**, can detect a log that shows different histories to different people.

## Tiles: logs as static files

tessellog follows [C2SP tlog-tiles](https://c2sp.org/tlog-tiles), the layout Tessera, Sigsum and Go's checksum database use. The whole log is a set of static files:

```
checkpoint                 the latest signed checkpoint
tile/0/000                 hashes of entries 0–255 (a full tile is never rewritten)
tile/0/001.p/17            a partial tile: hashes of entries 256–272
tile/1/000                 hashes of the level-0 tiles
tile/entries/000           the entries themselves, in bundles of 256
```

Because full tiles never change, they can sit in object storage behind a CDN with long cache lifetimes. Clients fetch only the tiles they need to verify a proof. Serving reads costs about as much as serving a static website, and the log's writer never handles a read.

## The life of an entry

tessellog keeps Tessera's three stages:

1. **Sequencing.** `appender.add(entry)` batches the entry with others (by default up to 256 entries, or for 250ms). It then asks the storage driver to assign the batch durable, contiguous indices. The promise resolves with `{ index, isDup }` once the index is durable. From then on the entry will be in the log even if the process crashes.
2. **Integration.** In the background, sequenced entries are hashed into the Merkle tree. New and changed tiles and entry bundles are written to storage, and the tree state moves forward with a compare-and-swap.
3. **Publication.** Every `checkpointInterval` (10 seconds by default) the appender signs a checkpoint for the integrated tree and writes it. If you configure witnesses, it publishes only after enough of them have cosigned. Unchanged checkpoints are re-signed every `checkpointRepublishInterval` (10 minutes), so readers can see the log is alive.

Sequencing is fast and promises an index. Publication is what makes the entry provable to others. A personality that must hand back a proof waits for `appender.awaitPublication(index)`.

## Personalities and the library

As in Tessera, tessellog is a library, not a server. Your application is the **personality**. It decides:
- what an entry is;
- who may add one;
- how entries are validated;
- what API clients use.

tessellog does the rest: sequencing, integration, publication, storage, garbage collection, antispam and witnessing. [`@tessellog/http`](../../packages/http) gives you a ready-made handler for the common case: POST entries, then serve tiles.

## Packages

| Package | Role |
|---|---|
| `@tessellog/core` | Merkle hashing, tile layout, signed notes, checkpoints, proofs, policies. Pure and portable: Node, Deno, Bun, Workers and browsers. |
| `@tessellog/appender` | The write path: batching, sequencing, integration, publication, pushback, antispam, witnessing, migration, garbage collection. |
| `@tessellog/client` | The read path: verifies checkpoints, inclusion, consistency and streamed entries. Browser-safe. `@tessellog/client/node` adds reading from disk. |
| `@tessellog/http` | A fetch-style handler for adding entries and serving tiles. `@tessellog/http/node` serves it with `node:http`. |
| `@tessellog/driver-posix` | Stores a log in a directory. It also provides persistent antispam and witness stores. |
| `@tessellog/driver-aws` | S3 for tiles and bundles, and DynamoDB for sequencing, tree state, the writer lease and antispam. |
| `@tessellog/driver-cloudflare` | R2 for tiles and bundles, and D1 for sequencing, tree state, the writer lease and antispam. |
| `@tessellog/driver-object-store` | Builds a driver from any object store plus a coordinator. The base for new cloud drivers. |
| `@tessellog/driver-conformance` | The Vitest suites every driver and store must pass. |
| `@tessellog/witness` | A C2SP tlog-witness, and a client for submitting checkpoints to witnesses. |
| `@tessellog/static-ct` | The static-ct-api data layer, for Certificate Transparency logs. |

## Coming from Tessera

| Tessera (Go) | tessellog (TypeScript) |
|---|---|
| `tessera.NewAppender(ctx, driver, opts)` | `createAppender({ driver, signer, ... })` |
| `appender.Add(ctx, entry)()` | `await appender.add(entry)` returns `{ index, isDup }` |
| `tessera.NewPublicationAwaiter` / `Await` | `await appender.awaitPublication(index)` |
| `WithCheckpointSigner(s, additional...)` | `signer`, `additionalSigners` |
| `WithBatching(size, age)` | `batching: { maxSize, maxAge }` |
| `WithCheckpointInterval` | `checkpointInterval` (ms) |
| `WithPushback(n)` | `pushback: { maxOutstanding }` |
| `WithAntispam(n, persistent)` | `antispam: { inMemoryEntries, store }` |
| `WithWitnesses(group, opts)` | `witnessing: { policy, timeout, failOpen }` |
| `WithGarbageCollectionInterval` | `garbageCollection: { interval }` |
| `WithCTLayout()` | `layout: staticCtLayout` plus the driver's `entriesPath: staticCtEntriesPath` |
| `tessera.NewMigrationTarget` | `createMigrationTarget({ driver, antispam?, layout? })` |
| `tessera.NewLogReader` | `createLogReader({ driver })`, or `appender.reader` |
| `posix.New`, `aws.New`, `gcp.New` | `openPosixDriver`, `openAwsDriver`, `openCloudflareDriver` (no GCP yet) |
| `client.NewProofBuilder`, `client.FetchCheckpoint` | `createLogClient({ fetcher, origin, logVerifier })` |

Indices and sizes are `bigint`, because they are uint64 in Go. Untrusted input comes back as `Result<T>` (`{ ok: true, value }` or `{ ok: false, error }`), never as an exception.
