# Learnings: Client, POSIX driver and interop

Earlier learnings live in `CLAUDE.md` and `docs/adr/`.

## Gotchas

## Patterns That Worked

## Decisions Made

### Two RFC 6962 proof recursions: sync over leaves, async over tiles
- **Options considered**: one async implementation behind both APIs, or two small ones.
- **Decision**: keep both. `inclusionProof` and `consistencyProof` stay synchronous for in-memory callers.
- **Safety net**: the tile versions are tested for equality against the leaf versions at boundary sizes.

## Edge Cases
