# Learnings: Client, POSIX driver and interop

Earlier learnings live in `CLAUDE.md` and `docs/adr/`.

## Gotchas

## Patterns That Worked

## Decisions Made

### Two RFC 6962 proof recursions: sync over leaves, async over tiles
- **Options considered**: one async implementation behind both APIs, or two small ones.
- **Decision**: keep both. `inclusionProof` and `consistencyProof` stay synchronous for in-memory callers.
- **Safety net**: the tile versions are tested for equality against the leaf versions at boundary sizes.

### Proof-building rejections are typed as `Error`
- **Context**: The client turns rejected tile reads into `Result` failures.
- **Decision**: `failureFrom(error: Error)` is the rejection handler, with no `instanceof` check.
- **Rationale**: Every rejection on that path comes from our `Error`-throwing tile reader or from `fetch`, which throws `TypeError`. A non-`Error` branch would be dead code, and the 100% coverage rule would flag it.

## Edge Cases
