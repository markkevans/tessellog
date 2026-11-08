# WIP: Appender with in-memory driver

## Current Step

Step 9 of 11: Too many outstanding entries are refused with pushback.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: tile layout (`tileLayout`, per-level summary rather than an enumeration)
- [x] Step 2: integrate into empty tree
- [x] Step 3: batched integration equivalence
- [x] Step 4: appender scaffold + sequencing
- [x] Step 5: integration loop (with `onError` reporting; fixed a missing-bundle data-loss bug)
- [x] Step 6: checkpoint publication
- [x] Step 7: inclusion proofs from tiles
- [x] Step 8: batching by size and age
- [ ] Step 9: pushback ← current
- [ ] Step 10: graceful shutdown
- [ ] Step 11: options validation

## Blockers

None.

## Follow-ups noted

- Integration should validate that tiles read from storage have `width * 32` bytes (do with the first real driver).
- The memory driver lives inside `@tessellog/appender` rather than a separate `driver-memory` package, to avoid a dependency cycle.

## Next Action

Write failing pushback tests with a gated integration driver.
