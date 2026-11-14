# Verifying and monitoring logs

A log is only as trustworthy as the checks people make against it. `@tessellog/client` verifies tlog-tiles logs over HTTP, from disk, or from any other source. These include logs written by Tessera, Sigsum-style logs, and Go's checksum database layout. It is browser-safe.

## A client

<!-- snippet: client/verify-over-http.ts -->
```ts
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseVerifierKey, type Checkpoint } from "@tessellog/core";

const verifier = parseVerifierKey("example.com/my-log+afda4ace+AcOem5yfbPSq9fNpNGwfDJ+fU8XvGDaJweXRm65tp4RB");
if (!verifier.ok) throw new Error(verifier.error);

const client = createLogClient({
  fetcher: createHttpFetcher({ baseUrl: "https://log.example.com/" }),
  origin: "example.com/my-log",
  logVerifier: verifier.value,
});

export const checkEntry = async (entry: Uint8Array, index: bigint, previous?: Checkpoint) => {
  const latest = await client.latestCheckpoint();
  if (!latest.ok) return latest;
  const { checkpoint } = latest.value;

  if (previous !== undefined) {
    const consistent = await client.checkConsistency(previous, checkpoint);
    if (!consistent.ok) return consistent;
  }
  return client.proveInclusion({ entry, index, checkpoint });
};
```

Every method returns a `Result`. A log that serves bad data produces `{ ok: false, error }`, never an exception, so you can treat a failure as evidence.

| Method | Checks |
|---|---|
| `latestCheckpoint()` | The checkpoint is well-formed and has the expected origin. The log key signed it. With `witnessPolicy`, the policy's quorum cosigned it. |
| `proveInclusion({ entry, index, checkpoint })` | The entry's leaf hash is at `index` in the tree that `checkpoint` commits to. |
| `checkConsistency(older, newer)` | `newer` extends `older` without changing it, and is not smaller. |
| `entries({ checkpoint, from?, to? })` | Streams entries, proving **each one** against the checkpoint. It checks whole bundles: every entry in a bundle that overlaps the range must hash to the checkpoint root, so tampering just outside the range is caught too. A bundle with too many or too few entries is refused. |

## Fetchers

A fetcher has three methods: `readCheckpoint`, `readTile(address)` and `readEntryBundle(address)`. Each returns bytes, or `undefined` when the file is missing.

- `createHttpFetcher({ baseUrl, fetch?, layout? })` fetches over HTTP. Pass your own `fetch` to add headers, retries or caching.
- `createFileFetcher({ root, layout? })` from `@tessellog/client/node` reads a log directory.
- An appender's `reader`, and `createLogReader({ driver })`, can be used as a fetcher directly. This is useful in tests.

When a partial tile has been garbage-collected because its full tile now exists, both fetchers fall back to the full tile. Clients holding older checkpoints keep working.

## Streaming entries

<!-- snippet: client/stream-entries.ts -->
```ts
import type { LogClient } from "@tessellog/client";

export const printEntries = async (client: LogClient, from: bigint) => {
  const latest = await client.latestCheckpoint();
  if (!latest.ok) throw new Error(latest.error);

  for await (const streamed of client.entries({ checkpoint: latest.value.checkpoint, from })) {
    if (!streamed.ok) throw new Error(streamed.error);
    console.log(streamed.value.index, new TextDecoder().decode(streamed.value.entry));
  }
};
```

Each streamed entry has been proved to be in the checkpoint's tree. Comparing bundles against level-0 tiles alone would trust the server's tiles. Tile reads are cached for the duration of a stream.

## Monitoring

A **monitor** watches a log over time:
- It remembers the last checkpoint it trusted.
- It checks every new checkpoint is consistent with it.
- It proves every new entry.

This is how a log's misbehaviour gets noticed, whether a fork, a rollback or an entry that shouldn't be there. The [`monitor`](../../examples/monitor) example does it in about seventy lines. It persists the trusted checkpoint to a file, prints each new entry's hash, and exits with status 1 on an alarm so it can drive alerting:

```sh
pnpm --filter @tessellog/example-monitor start \
  --url https://log.example.com/ --verifier-key "$(cat my-log.pub)" --state ./monitor.state
```

To catch a log that shows different histories to different people, compare checkpoints with other monitors, or require witness cosignatures. See [Witnessing](./witnessing.md).

## Reading other layouts

Pass `layout` to the client and fetcher to read a log whose entry bundles use another format. For example, `staticCtLayout` from `@tessellog/static-ct` reads static-CT logs. See [Static CT](./static-ct.md).
