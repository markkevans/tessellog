# Learnings: Antispam and witnessing

Earlier learnings live in `CLAUDE.md` and `docs/adr/`.

## Gotchas

### A `grep` on coverage output does not gate a commit
- **Issue**: `pnpm test:coverage | grep ...; ... && git commit` committed and pushed with coverage at 99.9%, because the `grep` succeeded.
- **Solution**: Gate commits on the command itself: `pnpm test:coverage >/dev/null && pnpm typecheck >/dev/null && git commit ...`.

## Patterns That Worked

## Decisions Made

### The dedup cache mutates a sealed Map (exception to ADR 4)
- **Context**: Tessera's default in-memory antispam capacity is 262,144 entries.
- **Decision**: An LRU over a mutable `Map`, private to `dedup.ts` and never exposed. Copying on every add, as ADR 4 asks, would cost O(n) per add.
- **Also**: A failed add evicts its entry, so it can be retried. If a newer add for the same entry is evicted by that, the only cost is a missed dedup, which is acceptable for a best-effort mechanism.

## Edge Cases
