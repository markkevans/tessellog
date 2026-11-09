# tessellog

[![CI](https://github.com/markkevans/tessellog/actions/workflows/ci.yml/badge.svg)](https://github.com/markkevans/tessellog/actions/workflows/ci.yml)

**Tamper-evident, append-only transparency logs in TypeScript.** It is a port of [Tessera](https://github.com/transparency-dev/tessera), and its logs interoperate with Tessera's.

Use tessellog when you need to prove what you published: software releases, certificates, key bindings, model cards, audit trails. Anyone can then check the proof.
- **Entries can't be changed or removed.** Every entry has an index in a Merkle tree, and anyone can verify an inclusion proof against a signed checkpoint.
- **History can't be rewritten.** Consistency proofs show that each checkpoint extends the last. Witnesses cosign checkpoints, so every client sees the same history.
- **Reads are static files.** Logs use the [C2SP tlog-tiles](https://c2sp.org/tlog-tiles) layout, so you can serve them from S3, R2, a CDN or nginx. The writer never handles a read.
- **It runs where your code runs.** The core and the client are pure TypeScript for Node, Deno, Bun, Cloudflare Workers and browsers. Storage drivers cover local disk, AWS (S3 + DynamoDB) and Cloudflare (R2 + D1).

## Thirty seconds

<!-- snippet: quickstart/memory-log.ts -->
```ts
import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { createLogClient } from "@tessellog/client";
import { generateNoteKey, parseSignerKey, parseVerifierKey } from "@tessellog/core";

const keys = generateNoteKey({ name: "example.com/my-log" });
if (!keys.ok) throw new Error(keys.error);
const signer = parseSignerKey(keys.value.signerKey);
const verifier = parseVerifierKey(keys.value.verifierKey);
if (!signer.ok || !verifier.ok) throw new Error("generated keys did not parse");

const appender = createAppender({
  driver: createMemoryDriver(),
  signer: signer.value,
  checkpointInterval: 100,
});

const entry = new TextEncoder().encode("hello, transparency");
const { index } = await appender.add(entry);
await appender.awaitPublication(index);

const client = createLogClient({
  fetcher: appender.reader,
  origin: "example.com/my-log",
  logVerifier: verifier.value,
});
const latest = await client.latestCheckpoint();
if (!latest.ok) throw new Error(latest.error);
const proved = await client.proveInclusion({ entry, index, checkpoint: latest.value.checkpoint });
console.log(proved.ok ? `entry ${index} is in the log` : proved.error);

await appender.shutdown();
```

To swap memory for disk or the cloud, change the driver. To serve the log over HTTP, add [`@tessellog/http`](./packages/http). Start with **[Getting started](./docs/guides/getting-started.md)**.

## Documentation

**[markkevans.github.io/tessellog](https://markkevans.github.io/tessellog/)** has the guides, the API reference for every package, and the architecture decisions, with search.

- [Concepts](./docs/guides/concepts.md): the life of an entry, tiles, and how tessellog maps to Tessera.
- [Getting started](./docs/guides/getting-started.md): a verified log over HTTP in ten minutes.
- [Keys and signing](./docs/guides/keys-and-signing.md), [storage drivers](./docs/guides/drivers.md), [personalities](./docs/guides/personalities.md), [verifying and monitoring](./docs/guides/verifying.md), [witnessing](./docs/guides/witnessing.md), [antispam](./docs/guides/antispam.md), [operations](./docs/guides/operations.md) and [static CT](./docs/guides/static-ct.md).

Every code block in the docs is a type-checked file, and CI fails if a block and its file drift apart.

## Packages

| Package | What it does |
|---|---|
| [`@tessellog/core`](./packages/core) | Merkle hashing, tiles, signed notes, checkpoints, proofs, keys and witness policies. Pure and portable. |
| [`@tessellog/appender`](./packages/appender) | The write path: batching, sequencing, integration, publication, pushback, antispam, witnessing, migration and garbage collection. |
| [`@tessellog/client`](./packages/client) | The read path: verifies checkpoints, inclusion, consistency and every streamed entry. Browser-safe. |
| [`@tessellog/http`](./packages/http) | A fetch-style handler that adds entries and serves tiles with the right cache headers, plus a `node:http` adapter. |
| [`@tessellog/driver-posix`](./packages/driver-posix) | Stores a log in a directory, with persistent antispam and witness stores. |
| [`@tessellog/driver-aws`](./packages/driver-aws) | S3 holds tiles and bundles. DynamoDB holds sequencing, tree state, the writer lease and antispam. |
| [`@tessellog/driver-cloudflare`](./packages/driver-cloudflare) | R2 holds tiles and bundles. D1 holds sequencing, tree state, the writer lease and antispam. |
| [`@tessellog/driver-object-store`](./packages/driver-object-store) | Builds a driver from any object store plus a coordinator. |
| [`@tessellog/driver-conformance`](./packages/driver-conformance) | The Vitest suites every driver and store must pass. |
| [`@tessellog/witness`](./packages/witness) | A C2SP tlog-witness, and a client for submitting checkpoints to witnesses. |
| [`@tessellog/static-ct`](./packages/static-ct) | The static-ct-api data layer, for Certificate Transparency logs. |

## Examples

Each one is a runnable package with tests that CI runs. See [`examples/`](./examples).

| Example | Shows |
|---|---|
| [`keygen`](./examples/keygen) | generating log and witness keys, compatible with Go's `note.GenerateKey` |
| [`posix-oneshot`](./examples/posix-oneshot) | adding files to a log on disk, like Tessera's |
| [`http-log`](./examples/http-log) | an HTTP log service on local disk |
| [`aws-log`](./examples/aws-log) | an HTTP log service on S3 and DynamoDB, whose clients read straight from S3 |
| [`cloudflare-worker`](./examples/cloudflare-worker) | a Worker and Durable Object over R2 and D1, also tested on workerd |
| [`witness-server`](./examples/witness-server) | a standalone witness with persistent state |
| [`monitor`](./examples/monitor) | watching a log, and raising an alarm on forks, rollbacks or unprovable entries |

## Interoperability with Tessera

CI checks both directions against Tessera v1.0.4 on every push ([`interop/run.sh`](./interop/run.sh)):
- Tessera's Go client verifies logs tessellog writes, and tessellog's client verifies logs Tessera writes.
- tessellog migrates in a Tessera log and appends to it, and Tessera's client verifies the result.
- Tessera logs are witnessed by tessellog's witness, and Go's `formats/note` verifies tessellog's cosignatures.
- Static CT works both ways, and Tessera's `ctonly` produces identical `TileLeaf`s for every entry.
- Tessera signs with keys from tessellog's `keygen`.

## Specifications

[tlog-tiles](https://c2sp.org/tlog-tiles), [tlog-checkpoint](https://c2sp.org/tlog-checkpoint), [signed-note](https://c2sp.org/signed-note), [tlog-cosignature](https://c2sp.org/tlog-cosignature), [tlog-witness](https://c2sp.org/tlog-witness), [tlog-policy](https://c2sp.org/tlog-policy) and [static-ct-api](https://c2sp.org/static-ct-api) (data layer).

## Not yet supported

These are recorded in the [architecture decisions](./docs/adr):
- **Witnessing:** ML-DSA-44 cosignatures, and the optional `sign-subtree` endpoint.
- **Storage:** drivers for GCP and MySQL.
- **Mirroring.**
- **Static CT:** RSA keys for RFC 6962 signatures.

## Development

```sh
pnpm install
docker compose up -d   # Floci (S3 + DynamoDB) for the AWS tests
pnpm test              # or pnpm test:coverage, which requires 100%
pnpm typecheck         # the workspace, plus browser-safety for core, client, http and edge drivers
pnpm build             # compiles every package to dist/
bash scripts/pack-smoke/run.sh   # installs the packed tarballs into a fresh project
bash interop/run.sh    # checks against Tessera; needs Go
```

The project is built test-first, with 100% coverage, strict TypeScript and no type assertions. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Origin and licence

tessellog is a TypeScript port of [transparency-dev/tessera](https://github.com/transparency-dev/tessera), the Go library for tile-based transparency logs. It follows Tessera's concepts, lifecycle and on-disk format.

Like Tessera, tessellog is licensed under the [Apache License, Version 2.0](./LICENSE). Attribution to the original Tessera authors is in [NOTICE](./NOTICE).

tessellog is an independent project. It is **not** affiliated with or endorsed by the Tessera authors or the transparency-dev project. For production Go deployments, use Tessera itself.
