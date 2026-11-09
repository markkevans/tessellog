# @tessellog/client

Verifies tlog-tiles transparency logs. It checks:
- signed checkpoints, optionally with a witness quorum;
- inclusion proofs;
- consistency between checkpoints;
- every streamed entry.

It reads logs written by tessellog, Tessera, or anything else that follows C2SP tlog-tiles. The main entry point is browser-safe. `@tessellog/client/node` adds reading from disk.

```sh
npm install @tessellog/client @tessellog/core
```

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

## API

- `createLogClient({ fetcher, origin, logVerifier, otherVerifiers?, witnessPolicy?, layout? })` returns these methods:
  - `latestCheckpoint()`
  - `proveInclusion({ entry, index, checkpoint })`
  - `checkConsistency(older, newer)`
  - `entries({ checkpoint, from?, to? })`, an async iterable of proved entries
- `createHttpFetcher({ baseUrl, fetch?, layout? })` fetches over HTTP.
- `createFileFetcher({ root, layout? })` from `@tessellog/client/node` reads a directory.
- `tlogTilesClientLayout` is the default layout. Pass `staticCtLayout` from `@tessellog/static-ct` to read static-CT logs.

Every method returns a `Result`, so a misbehaving log produces evidence, not an exception. Both fetchers fall back to full tiles when partial tiles have been garbage-collected.

Guide: [verifying and monitoring logs](https://github.com/markkevans/tessellog/blob/main/docs/guides/verifying.md).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
