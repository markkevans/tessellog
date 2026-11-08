# tessellog

TypeScript port of [Tessera](https://github.com/transparency-dev/tessera): tile-based transparency logs (C2SP tlog-tiles, tlog-checkpoint, signed-note). Apache-2.0, credited in `NOTICE`. Copyright Mark Evans.

## Layout

- `packages/core` (`@tessellog/core`): pure, does no I/O. RFC 6962 hashing, tile paths and layout, entry bundles, signed notes, checkpoints, proof building and verification, integration of leaves into tiles, and inclusion proofs from tiles.
- `packages/appender` (`@tessellog/appender`): batching, sequencing, background integration, checkpoint publishing, pushback, shutdown, a Zod options schema, and the in-memory driver.
- Architectural decisions are in `docs/adr/`.

## Coverage exceptions

- `packages/driver-conformance` is excluded from coverage. It is test infrastructure, a Vitest suite run against each driver, and is never shipped. Its only uncovered lines are guards that fail a test loudly when a fixture is broken. (Approved within the phase 3/4 plan, 2026-11-08.)

## Commands

- `pnpm test`, `pnpm test:coverage` (fails below 100% on any metric), `pnpm typecheck` (the whole workspace).

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

## Patterns

- Integration stays in `core` and is pure. Given `fromSize`, a tile reader and new leaf hashes, it returns the changed tiles and the new root. The root is computed from tiles alone, as the subtree hash of `[0, size)`.
- A single subtree hasher (`core/src/tile-hashes.ts`) serves both tile roots and inclusion proofs from tiles.
- Background work (integration, publication) runs through `serialTasks`: one task at a time, with failures sent to `onError`, which defaults to `console.error`.
- Stateful runtime code reassigns closure `let` bindings with new immutable values. It never mutates in place.
