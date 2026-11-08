# WIP: Appender with in-memory driver

## Current Step

Step 4 of 11: Scaffold `@tessellog/appender` with an in-memory driver that sequences entries.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: tile layout (`tileLayout`, per-level summary rather than an enumeration)
- [x] Step 2: integrate into empty tree
- [x] Step 3: batched integration equivalence
- [ ] Step 4: appender scaffold + sequencing ← current
- [ ] Step 5: integration loop
- [ ] Step 6: checkpoint publication
- [ ] Step 7: inclusion proofs from tiles
- [ ] Step 8: batching by size and age
- [ ] Step 9: pushback
- [ ] Step 10: graceful shutdown
- [ ] Step 11: options validation

## Blockers

None.

## Follow-ups noted

- Integration should validate that tiles read from storage have `width * 32` bytes (do with the first real driver).
- The memory driver lives inside `@tessellog/appender` rather than a separate `driver-memory` package, to avoid a dependency cycle.

## Next Action

Scaffold the appender package and write the failing sequencing test.
