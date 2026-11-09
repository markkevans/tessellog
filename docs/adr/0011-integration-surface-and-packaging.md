# 11. The integration surface: awaiting publication, quiescent reads, HTTP, packaging and checked docs

- Status: accepted
- Date: 2026-11-09

## Context

Phases 1–9 delivered Tessera's capabilities. Integrators still lacked several things:
- a way to generate keys without Go;
- a way to wait for an entry to become provable;
- a read-only lifecycle;
- a persistent witness store;
- installable packages;
- documentation whose examples are known to work.

## Decision

**Keys.** `generateNoteKey({ name, seed? })` in `core` formats keys exactly as Go's `note.GenerateKey`. A test pins it to Go's vector, and interop has Tessera sign with a generated key.

**Lifecycles**
- `appender.awaitPublication(index)` resolves with the first published checkpoint covering the index, like Tessera's `PublicationAwaiter`. It rejects for indices still unpublished at shutdown.
- `createLogReader({ driver })` is the quiescent lifecycle: reads only, no writes.
- An appender now integrates a previous writer's sequenced entries as soon as it starts, rather than waiting for its first `add`.

**Driver contract (amends ADR 5).** `sequence([])` reserves nothing and returns the next index, and the batcher never sends an empty batch. Before this change, D1 recorded a zero-count batch that collided with the next writer's first batch, and DynamoDB retried forever.

**Witness store.** `openPosixWitnessStore` (in `driver-posix`) persists each log's latest checkpoint with compare-and-swap, and locks its directory. `describeWitnessStore` is the contract.

**`@tessellog/http`**
- A fetch-style handler built on an `Appender`. `POST /add` answers after publication. `GET` serves the checkpoint and tiles through the appender's `LogReader`, with cache headers for immutable and partial files.
- It reads bodies with a cap, turns pushback into 503, and answers non-canonical paths with 404.
- `@tessellog/http/node` adapts any fetch-style handler to `node:http`. The examples and the witness server share it.

**Portability**
- The Cloudflare driver uses the global `crypto.randomUUID`, so it runs on workerd without `nodejs_compat`. A test bundles the Worker example with esbuild and runs it on workerd.
- `tsconfig.browser.json` type-checks `core`, `client`, `http`, `witness`, `static-ct`, `appender` and the edge drivers without Node's types.

**Packaging**
- Workspace development resolves packages to `src`. `publishConfig.exports` switches published packages to `dist`, built by `tsc` with declarations. Builds map `@tessellog/*` to the dependencies' built declarations through `paths`. `preserveSymlinks` was rejected because it breaks the AWS SDK's types under pnpm.
- CI's pack smoke test installs every tarball into a fresh project, runs a POSIX log end to end under plain Node, and type-checks the published declarations.
- Changesets version the eleven packages as one fixed group. A manually dispatched workflow publishes with provenance.

**Documentation.** Every TypeScript block in the guides and package READMEs is a file in `docs/snippets`:
- the files are type-checked;
- the self-contained ones run in CI;
- a test fails on drift, and on any TypeScript block that is not a snippet;
- `pnpm --filter @tessellog/docs sync` rewrites the markdown from the files.

## Consequences

- D1 indices now cross the boundary as text and are exact to 2^63 − 1 (amends ADR 8).
- The examples are workspace packages inside the coverage gate. They can only change together with their tests.
- Publishing needs an `NPM_TOKEN` secret. The workflow pushes a release commit to `main`, so branch protection must allow the workflow to push.
- Still deferred: ML-DSA-44 cosignatures, `sign-subtree`, mirroring, GCP and MySQL drivers, and RSA RFC 6962 keys.
