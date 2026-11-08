# tessellog

[![CI](https://github.com/markkevans/tessellog/actions/workflows/ci.yml/badge.svg)](https://github.com/markkevans/tessellog/actions/workflows/ci.yml)

A TypeScript library for building tile-based transparency logs, ported from
[Tessera](https://github.com/transparency-dev/tessera).

## Origin and licence

tessellog is a TypeScript port of
[transparency-dev/tessera](https://github.com/transparency-dev/tessera), the
Go library for tile-based transparency logs. It follows Tessera's concepts,
lifecycle and on-disk format:

- Entries go through sequencing, then integration, then publication.
- Batching, pushback and antispam.
- Witnessing.
- Appender, migration and quiescent lifecycles.
- Pluggable storage drivers.

Logs written by tessellog are meant to be readable by Tessera clients, and
logs written by Tessera are meant to be readable by tessellog clients.

Like Tessera, tessellog is licensed under the
[Apache License, Version 2.0](./LICENSE). Attribution to the original Tessera
authors is in [NOTICE](./NOTICE).

tessellog is an independent project. It is **not** affiliated with or endorsed
by the Tessera authors or the transparency-dev project. For production Go
deployments, use Tessera itself.

## Specifications

tessellog implements these C2SP specifications:

- [tlog-tiles](https://c2sp.org/tlog-tiles): the static tile layout for the
  Merkle tree and the entry bundles.
- [tlog-checkpoint](https://c2sp.org/tlog-checkpoint): the signed tree head
  format.
- [signed-note](https://c2sp.org/signed-note): the signature envelope.

## Packages

| Package | Status | Purpose |
|---|---|---|
| `@tessellog/core` | usable | RFC 6962 hashing, tile layout, entry bundles, signed notes, checkpoints, building and verifying proofs (from leaves or from tiles), and integrating leaves into tiles. It does no I/O. |
| `@tessellog/appender` | usable | Batching, sequencing, background integration, signed checkpoint publishing, pushback, graceful shutdown, validated options and an in-memory driver. |
| `@tessellog/driver-posix` | usable | Stores a log in a directory at tlog-tiles paths. Atomic writes, restart-safe, single writer. |
| `@tessellog/client` | usable | Verifies checkpoints, inclusion, consistency and streamed entries over HTTP or (via `@tessellog/client/node`) from disk. Falls back to full tiles when partials are gone. |
| `@tessellog/witness` | planned | Witness cosigning and policy. |
| AWS and Cloudflare drivers | planned | Cloud storage drivers. |

## Interoperability with Tessera

CI checks both directions on every push (`interop/run.sh`):
- Tessera's Go client verifies a log written by tessellog.
- tessellog's client verifies a log written by Tessera's `posix-oneshot`.

Each run checks checkpoints, every inclusion proof, consistency across sessions and the exact entries.

## Examples

Write a log to disk:

```sh
pnpm --filter @tessellog/example-posix-oneshot oneshot \
  --storage-dir ./my-log --private-key ./log.key entries/*
```

Verify a log over HTTP:

```ts
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseVerifierKey } from "@tessellog/core";

const verifier = parseVerifierKey("example.com/log+abcd1234+AbC...");
if (!verifier.ok) throw new Error(verifier.error);

const client = createLogClient({
  fetcher: createHttpFetcher({ baseUrl: "https://example.com/log/" }),
  origin: "example.com/log",
  logVerifier: verifier.value,
});
const latest = await client.latestCheckpoint();
```

Architectural decisions are recorded in [`docs/adr`](./docs/adr).

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
```
