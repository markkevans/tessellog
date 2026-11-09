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
| `@tessellog/appender` | usable | Batching, sequencing, background integration, signed checkpoint publishing, pushback, graceful shutdown, validated options, an in-memory driver, best-effort antispam, and publishing only witnessed checkpoints. |
| `@tessellog/driver-posix` | usable | Stores a log in a directory at tlog-tiles paths. Atomic writes, restart-safe, single writer, plus a persistent antispam store. |
| `@tessellog/client` | usable | Verifies checkpoints (optionally requiring a witness quorum), inclusion, consistency and streamed entries over HTTP or (via `@tessellog/client/node`) from disk. Falls back to full tiles when partials are gone. |
| `@tessellog/witness` | usable | A C2SP `tlog-witness` `add-checkpoint` endpoint (fetch-style handler) and a client for submitting checkpoints to witnesses. |
| `@tessellog/driver-aws` | usable | S3 for tiles and bundles, DynamoDB for sequencing, tree state, a single-writer lease and antispam. |
| `@tessellog/driver-cloudflare` | usable | R2 for tiles and bundles, D1 for sequencing, tree state, a single-writer lease and antispam. |
| `@tessellog/driver-object-store` | usable | The shared core of the cloud drivers: an object store plus a coordinator. |
| `@tessellog/static-ct` | usable | The static-ct-api data layer: CT entries, `TileLeaf` data tiles, `MerkleTreeLeaf` hashing and a layout for the appender, client and migration target. |

## Interoperability with Tessera

CI checks both directions on every push (`interop/run.sh`):
- Tessera's Go client verifies a log written by tessellog.
- tessellog's client verifies a log written by Tessera's `posix-oneshot`.
- Tessera's `posix-oneshot` gets its checkpoints cosigned by tessellog's witness over HTTP, and tessellog's client checks the quorum.
- Go's `formats/note` verifies cosignatures on a tessellog-written log.
- tessellog migrates in a Tessera-written log and appends to it, and Tessera's client verifies the result.
- Tessera's `ctonly` and client verify a tessellog static-CT log, and tessellog's client verifies a Tessera static-CT log.

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
docker compose up -d   # Floci, for the AWS driver tests
pnpm test
pnpm typecheck
bash interop/run.sh    # needs Go
```
