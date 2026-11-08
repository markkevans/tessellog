# Learnings: tessellog

## Gotchas

### Spreading large byte arrays overflows the stack
- **Context**: `Uint8Array.of(...bytes)` or other spreads of entries.
- **Issue**: Above roughly 128 KiB, V8 throws "Maximum call stack size exceeded". Static-CT entries reach 256 KiB.
- **Solution**: Use `concatBytes` from `@noble/hashes/utils`.

### V8 coverage does not split `||` operands into branches
- **Context**: Guards like `index < 0n || index >= size`.
- **Issue**: 100% branch coverage can hide an untested operand.
- **Solution**: Give each guard condition its own behavioural test, not just one per `if`.

### Upstream vector suites can miss real paths
- **Context**: The transparency-dev/merkle consistency probes cover only an 8-leaf tree.
- **Issue**: The left-sibling path while rebuilding the old root was never exercised.
- **Solution**: Add hand-derived RFC 6962 examples (3→8) alongside imported vectors.

### Never run Vitest with `--root /`
- **Issue**: It walks the whole filesystem and hangs.
- **Solution**: Put throwaway checks in Python (`-I`), or in a file inside the project.

### `git add -A` committed generated coverage reports
- **Solution**: `coverage` is now in `.gitignore`. Stage explicit paths.

### Coverage instrumentation can push heavy tests past the 5s timeout
- **Context**: Sweeping every tree size 0–600 with full re-hashing.
- **Issue**: It passed in 0.6s normally but timed out under `--coverage`.
- **Solution**: Test tile-boundary sizes (0–3, 127, 255–257, 511–513) instead of exhaustive sweeps.

## Patterns That Worked

### Import reference vectors, never trust memory
- Go's `note` and `formats` tests, transparency-dev/merkle probes and the RFC 6962 examples gave byte-exact expectations.
- Every expected value is either an upstream vector or comes from an independent oracle (`node:crypto`, Python `hashlib`).

### `Result<T>` at trust boundaries, `RangeError` for programmer errors
- Parsing network data (bundles, notes, checkpoints) returns `Result`.
- Building paths, bundles or checkpoints from your own code throws `RangeError`.

## Decisions Made

### Stricter than Go where the C2SP spec is stricter
- Checkpoints: the size has no leading zeros, the root hash is 32 bytes, and extension lines are non-empty.
- Notes: base64 must be canonical, and `signNote` rejects text that `Open` would reject.
- **Trade-off**: We may reject a log that Go accepts but that violates the spec.

## Edge Cases

- A consistency proof from size 0 is an error, as in Go.
- Equal sizes require an empty proof and equal roots.
- A note may carry at most 100 signatures, as in Go's limit.
