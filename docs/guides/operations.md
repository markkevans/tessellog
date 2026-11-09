# Operating a log

## Tuning

| Option | Default | Trade-off |
|---|---|---|
| `batching.maxSize` | 256 | Larger batches mean fewer storage writes, so more throughput. |
| `batching.maxAge` (ms) | 250 | The longest an entry waits for its batch to fill. Lower it for lower latency on quiet logs. |
| `checkpointInterval` (ms) | 10,000 | How often a new checkpoint is published. This bounds `awaitPublication`, and is the latency clients see before an entry is provable. Each publication costs a signature, a write and, with witnessing, a round to every witness. |
| `checkpointRepublishInterval` (ms) | 600,000 | An unchanged checkpoint is re-signed this often, so readers can tell the log is alive. It must be at least `checkpointInterval`. |
| `pushback.maxOutstanding` | 4,096 | Entries accepted but not yet integrated before `add` throws `PushbackError`. |
| `garbageCollection.interval` (ms) | 60,000 | How often obsolete partial tiles and integrated sequencing state are deleted. `0` disables it. |
| `onError` | logs to the console | Receives failures from background work: integration, publication, garbage collection, antispam following. |

The appender validates all options with Zod when it is created. A mistake, such as an additional signer with the wrong name, throws at once with every problem listed.

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

## Shutting down

`await appender.shutdown()` does the following, in order:
1. Stops accepting entries.
2. Sequences whatever is still batched.
3. Integrates everything sequenced.
4. Brings antispam up to date.
5. Publishes a final checkpoint.
6. Stops background work.

Then call the driver's `close()` to release its lock or lease. Pending `awaitPublication` calls resolve if the final checkpoint covers them, and reject otherwise.

If a process dies without shutting down, nothing durable is lost. Sequenced entries are integrated by the next writer, and a cloud lease simply expires.

## Garbage collection

When a tile fills up, its partial versions (`.p/1` … `.p/255`) become obsolete. The appender deletes them, and the matching partial bundles, up to the **published** checkpoint size. It also forgets sequenced batches that are integrated. Clients holding older checkpoints keep working: the client falls back to the full tile when a partial has gone. See [ADR 9](../adr/0009-garbage-collection-and-migration.md).

## Freezing a log

To stop a log for good, for example when a CT shard reaches its end date:
1. Shut down its appender.
2. From then on, read it with `createLogReader({ driver })`, as `freeze` does above. A reader never writes, so the log stays exactly as published.

Tessera calls this the quiescent lifecycle.

## Migrating a log

`createMigrationTarget` copies a log, written by Tessera or by tessellog, into a new driver. It works from the source's entry bundles alone:

<!-- snippet: operations/migrate.ts -->
```ts
import { createMigrationTarget } from "@tessellog/appender";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseVerifierKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const verifier = parseVerifierKey("example.com/my-log+afda4ace+AcOem5yfbPSq9fNpNGwfDJ+fU8XvGDaJweXRm65tp4RB");
if (!verifier.ok) throw new Error(verifier.error);

const source = createHttpFetcher({ baseUrl: "https://old-log.example.com/" });
const latest = await createLogClient({
  fetcher: source,
  origin: "example.com/my-log",
  logVerifier: verifier.value,
}).latestCheckpoint();
if (!latest.ok) throw new Error(latest.error);

const driver = await openPosixDriver({ root: "./migrated-log" });
const migrated = await createMigrationTarget({ driver }).migrate({
  readEntryBundle: (address) => source.readEntryBundle(address),
  sourceSize: latest.value.checkpoint.size,
  sourceRoot: latest.value.checkpoint.rootHash,
});
console.log(migrated.ok ? "copied and verified; start an appender on ./migrated-log" : migrated.error);
await driver.close();
```

The migration target:
- copies bundles into the same indices, integrating as it goes;
- can fill an antispam store (`antispam`);
- resumes where it stopped if interrupted;
- succeeds only if the final root equals the source's root.

It **publishes no checkpoint**, so there is never a moment with two canonical logs. Once it succeeds, stop the old writer and start an appender on the new driver with the same key. CI migrates a log written by Tessera's `posix-oneshot`, appends to it, and Tessera's Go client verifies the result.

## Running in production

- **One writer.** Run one appender per log. Drivers refuse a second writer (see [drivers](./drivers.md#one-writer-at-a-time)).
- **Back up the private state.** The public files can be rebuilt from bundles. The POSIX `.state/`, or the DynamoDB or D1 tables, hold sequenced entries that are not yet integrated.
- **Monitor your own log.** Run the [`monitor`](../../examples/monitor) against your public URL. It is the cheapest way to learn that your log serves something unverifiable.
- **Watch `onError`.** Repeated failures mean the log is not advancing, even though `add` may still succeed until pushback starts.
- **Serve reads from storage or a CDN**, not from the writer. See [personalities](./personalities.md#serving-reads-at-scale).
