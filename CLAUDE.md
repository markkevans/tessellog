# tessellog

TypeScript port of [Tessera](https://github.com/transparency-dev/tessera): tile-based transparency logs (C2SP tlog-tiles, tlog-checkpoint, signed-note). Apache-2.0, credited in `NOTICE`. Copyright Mark Evans.

## Layout

- `packages/core` (`@tessellog/core`): pure, does no I/O. RFC 6962 hashing, tile paths and layout, entry bundles, signed notes, checkpoints, proof building and verification, integration of leaves into tiles, and inclusion proofs from tiles.
- `packages/appender` (`@tessellog/appender`): batching, sequencing, background integration, checkpoint publishing, pushback, shutdown, a Zod options schema, and the in-memory driver.
- `packages/driver-posix`: stores a log in a directory. Atomic write-then-rename, `.state/` holds sequenced batches and tree state, and `.state/lock` enforces a single writer.
- `packages/client`: verifying client. `@tessellog/client/node` adds the file fetcher, keeping the main entry browser-safe.
- `packages/driver-object-store`: `ObjectStore` + `Coordinator` + `Lease` compose into a `LogDriver` (ADR 8). `packages/driver-aws` (S3 + DynamoDB) and `packages/driver-cloudflare` (R2 + D1) build on it.
- `packages/static-ct`: the static-ct-api data layer and `staticCtLayout` (ADR 10).
- `packages/witness`: `createWitness` (fetch-style `add-checkpoint` handler, compare-and-swap `WitnessStore`) and `createWitnessClient`.
- `packages/driver-posix` also holds `openPosixAntispamStore` and `openPosixWitnessStore`.
- `packages/http` (`@tessellog/http`): `createLogHandler({ appender })`, a fetch-style add-and-serve handler. `@tessellog/http/node` has `serveNode`, which adapts any fetch-style handler (log or witness) to `node:http`.
- `packages/driver-conformance` (published for third-party drivers): `describeLogDriver`, `describeObjectStore`, `describeCoordinator`, `describeAntispamStore` and `describeWitnessStore`. Every driver and store must pass them.
- `examples/`: `keygen`, `posix-oneshot`, `http-log`, `aws-log` (Floci), `cloudflare-worker` (Miniflare, plus a workerd bundle test), `witness-server` and `monitor`. Each is a tested workspace package inside the coverage gate, and its CLI runs through `tsx`.
- `docs/` (`@tessellog/docs`, private): guides in `docs/guides`, and code in `docs/snippets/*.ts`. These are type-checked, the self-contained ones run, and a test fails on drift or on any non-snippet TypeScript block. `pnpm --filter @tessellog/docs sync` rewrites the markdown from the files.
- `scripts/pack-smoke/run.sh`: builds, packs, installs the tarballs into a fresh project, runs a POSIX log under plain Node, and type-checks the `.d.ts` files. CI runs it.
- Releases: changesets (v3, fixed group of eleven packages) and `.github/workflows/release.yml`, which is dispatched manually and needs `NPM_TOKEN`.
- `interop/`: `run.sh` checks logs and witnessing in both directions against Tessera v1.0.4 (Go), including a real HTTP witness server (`witness-server.ts`). It needs Go, and CI runs it.
- Architectural decisions are in `docs/adr/`.

## Coverage exceptions

- `packages/driver-conformance` is excluded from coverage. It is test infrastructure: Vitest suites run against each driver. Since 2026-11-09 it is also published, so third-party drivers can run the suites. Its only uncovered lines are guards that fail a test loudly when a fixture is broken. (Approved by Mark, 2026-11-08. The rationale was updated when it became publishable.)

## Commands

- Run `docker compose up -d` first. The AWS tests need Floci on :4566 and do not skip without it.
- `pnpm test`, `pnpm test:coverage` (fails below 100% on any metric), `pnpm typecheck` (the whole workspace, plus `tsconfig.browser.json`, which has no Node types).
- `pnpm build` (`tsc -p tsconfig.build.json` per package), then `bash scripts/pack-smoke/run.sh`.

## Working rules for this repo

- Every expected value in a test comes from an upstream vector (Go `note`/`formats` tests, `packages/core/test/vectors/merkle`, RFC 6962) or an independent oracle (`node:crypto`, Python `hashlib -I`). Never from memory.
- Use `Result<T>` when parsing untrusted bytes. Throw `RangeError` for invalid input from our own code.
- Stage explicit paths. Never `git add -A`.

## Gotchas

- **Spreading large byte arrays** (`Uint8Array.of(...bytes)`) overflows the stack above about 128 KiB. Static-CT entries reach 256 KiB. Use `concatBytes` from `@noble/hashes/utils`.
- **V8 coverage treats `a || b` as one branch.** Give each guard condition its own test, or an untested operand hides behind 100% coverage.
- **An uncovered `??` fallback is a clue.** One hid data loss: a missing partial bundle was decoded as empty and then rewritten without its earlier entries. A missing partial tile or bundle must be an error.
- **Upstream vectors miss paths.** The transparency-dev/merkle consistency probes never rebuild an old root through a left sibling. The RFC 6962 example 3→8 does.
- **Coverage slows heavy tests about 5×.** Prefer tile-boundary sizes (0–3, 127, 255–257, 511–513, 600) to exhaustive sweeps. Give the genuine 70,000-leaf level-2 tests an explicit 20s timeout.
- **`Promise.race([p.then(...), Promise.resolve()])` always reports "pending".** Track settlement with a flag and read it after `vi.advanceTimersByTimeAsync`.
- **Fake timers plus batching:** `await Promise.all(adds)` deadlocks, because the age timer never fires. Start the adds, advance past `maxAge`, then await. Tests that aren't about batching use `batching: { maxSize: 1 }`.
- **Never run Vitest with `--root /`.** It walks the whole filesystem.
- **Treating a missing file as empty is a recurring trap.** It hid data loss twice (a partial bundle, then a POSIX batch). Reads that must exist use a reader that throws (`readExisting`), and an uncovered `??` fallback is a clue.
- **A failed `grep` guard silently skips a chained `cd`**, and relative-path edit scripts then write to the wrong place. Use absolute paths in edit scripts and check `git status` afterwards.
- **Gate commits on exit codes, not output.** `pnpm test:coverage | grep …; git commit` once pushed a commit at 99.9% coverage. Use `pnpm test:coverage >/dev/null && pnpm typecheck >/dev/null && git commit …`.
- **Witness tests: tamper before signing, not after.** Editing a signed checkpoint makes the witness return 403 before the rule under test, such as the empty-root 422, is reached.
- **Miniflare's proxy resets under thousands of concurrent reads.** Share one read per tile, as clients do, and avoid unbounded fan-out against any remote store.
- **Keep interop fixtures out of other scenarios' globs.** `$work/*/entry-*` matched a new fixture directory and doubled a count.
- **Never delete the batch that anchors the next index** (POSIX garbage collection).
- **Push only after GREEN.** CI runs on the latest pushed commit, so pushing a RED commit on its own turns `main` red.
- **Workspace TypeScript can't run under plain Node.** Imports use `.js` specifiers that map to `.ts` files, so CLIs and scripts run through `tsx`.

- **D1 binds JS numbers as doubles.** Even `next + ?` with a small count rounds above 2^53. Indices go in as `CAST(? AS INTEGER)` with string bindings, and come out as `CAST(… AS TEXT)`.
- **An empty batch must reserve nothing.** Shutdown used to flush an empty batch: D1 stored a zero-count row that collided with the next batch, and DynamoDB retried forever. The conformance suites now cover `sequence([])`.
- **tlog-tiles entries are at most 65,535 bytes** (bundles use a uint16 length), not 64 KiB.
- **macOS's listen backlog drops about 128+ concurrent connects** (ECONNRESET). Tests that hammer a real socket add in rounds.
- **Miniflare's workerd supports compatibility dates only up to its build** (2026-08 for 4.20260730). Dispose Miniflare only after closing the Durable Objects that use its bindings, or background tasks hit "poisoned stub".
- **`preserveSymlinks` breaks the AWS SDK's types under pnpm.** Package builds map `@tessellog/*` to built `.d.ts` files through `paths` in `tsconfig.build.json` instead.
- **Headers are not iterable without `DOM.Iterable`.** Use `headers.forEach`. `Uint8Array<ArrayBufferLike>` is not `BodyInit`, so copy with `Uint8Array.from`.
- **`changeset init` (v3) is interactive.** `.changeset/config.json` was written by hand from `@changesets/config`'s schema.
- **Documenting is testing.** Writing the operations guide exposed that an appender didn't integrate a crashed writer's batches until its first `add`. Check every claim in a guide against the code.

## Patterns

- Integration stays in `core` and is pure. Given `fromSize`, a tile reader and new leaf hashes, it returns the changed tiles and the new root. The root is computed from tiles alone, as the subtree hash of `[0, size)`.
- A single subtree hasher (`core/src/tile-hashes.ts`) serves both tile roots and inclusion proofs from tiles.
- Background work (integration, publication) runs through `serialTasks`: one task at a time, with failures sent to `onError`, which defaults to `console.error`.
- Stateful runtime code reassigns closure `let` bindings with new immutable values. It never mutates in place.
- The client proves every streamed entry against the signed checkpoint. Comparing entries with level-0 tiles alone would trust the server's tiles. Tile reads are cached per stream.
- Proof building from tiles (async) and from leaves (sync) are separate small recursions, kept in agreement by equality tests at boundary sizes.
- The client's rejection handler is typed `(error: Error)`. Every rejection on that path comes from `Error`-throwing code, so a non-`Error` branch would be dead code.
- Inject AWS failures with SDK middleware (`client.middlewareStack.add(…, { step: "initialize" })`) on a real client, not with type hacks.
- Validate DynamoDB items and D1 rows with Zod. `?? "0"` defaults on storage rows would silently restart counters.
- Antispam is layered and best-effort (ADR 6). Witnessing uses Ed25519 cosignatures and `tlog-policy` (ADR 7). Large caches use sealed mutable `Map`s (ADR 4 amendment).
- Cosignature test vectors come from Go `formats/note` via a throwaway program, recorded in `packages/core/test/vectors/cosignatures/README.md`.
- The "ENOENT means missing" check is duplicated on purpose in `driver-posix` and `client`, because the client must not depend on the driver.

- Personalities depend on an `Appender`, not a driver. `appender.reader` and `createLogReader({ driver })` are valid client fetchers, which keeps example and doc tests free of HTTP.
- Example CLIs exit through a `never`-typed helper (`const exitWith: (m: string) => never = …`) so TypeScript narrows after it.
- Durable Objects hold the appender, memoise the opening promise, and drop it on failure so the next request retries. An evicted instance's lease simply runs out.
