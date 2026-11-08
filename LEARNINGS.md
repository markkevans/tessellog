# Learnings: Client, POSIX driver and interop

Earlier learnings live in `CLAUDE.md` and `docs/adr/`.

## Gotchas

### A failed `grep` guard silently skips a chained `cd`
- **Context**: `grep ... && cd dir && python3 - <<EOF` with relative paths.
- **Issue**: The grep didn't match, so the `cd` was skipped and the script wrote `state.ts` to the repo root.
- **Solution**: Use absolute paths in edit scripts, and check `git status` after multi-file edits.

### Treating a missing file as empty is a recurring trap
- The POSIX batch reader had the same `?? new Uint8Array()` shape as the earlier bundle bug. Storage reads that must exist now use `readExisting`, which throws.

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

### Streamed entries are verified by inclusion proofs, not tile comparison
- **Issue**: Comparing an entry's leaf hash with its level-0 tile trusts the tile. A malicious server can serve a matching fake tile and bundle.
- **Decision**: Every streamed entry is proven against the signed checkpoint. Tile reads are cached for the duration of the stream.

### "ENOENT means missing" is written twice on purpose
- It appears in `driver-posix/src/files.ts` and `client/src/file-fetcher.ts`. The client must not depend on the driver, and the predicate is two lines.

## Edge Cases
