# tessellog

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
| `@tessellog/core` | usable | RFC 6962 hashing, tile layout, entry bundles, signed notes, checkpoints, building and verifying proofs, integrating leaves into tiles, and inclusion proofs from tiles. It does no I/O. |
| `@tessellog/appender` | usable (in-memory driver) | Batching, sequencing, background integration, signed checkpoint publishing, pushback, graceful shutdown and validated options. |
| `@tessellog/client` | planned | Fetches tiles over HTTP and verifies inclusion and consistency proofs. Works in browsers. |
| `@tessellog/witness` | planned | Witness cosigning and policy. |
| `@tessellog/driver-*` | planned | POSIX, AWS and Cloudflare storage drivers. |

## Example

```ts
import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { parseSignerKey } from "@tessellog/core";

const signer = parseSignerKey(process.env.LOG_PRIVATE_KEY ?? "");
if (!signer.ok) throw new Error(signer.error);

const log = createAppender({ driver: createMemoryDriver(), signer: signer.value });
const { index } = await log.add(new TextEncoder().encode("hello, log"));
await log.shutdown();
```

Architectural decisions are recorded in [`docs/adr`](./docs/adr).

## Development

```sh
pnpm install
pnpm test
pnpm typecheck
```
