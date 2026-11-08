# WIP: Client (phase 3), POSIX driver and interop (phase 4)

## Current Step

Step 14 of 17: The client reads a POSIX log directly from disk.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: consistency proofs from tiles
- [x] Step 2: HTTP fetcher
- [x] Step 3: partial tile fallback
- [x] Step 4: open the latest checkpoint
- [x] Step 5: prove inclusion
- [x] Step 6: check consistency
- [x] Step 7: stream verified entries
- [x] Step 8: CI workflow (Node 22 and 24: Node 20 is end-of-life), green on first run
- [x] Step 9: driver conformance suite (coverage exception awaiting approval)
- [x] Step 10: POSIX driver
- [x] Step 11: POSIX restart persistence (CI actions moved to their Node 24 releases at Mark's request)
- [x] Step 12: POSIX single-writer lock (also fixed: lock released when opening fails)
- [x] Step 13: tile length validation
- [ ] Step 14: client file fetcher ← current
- [ ] Step 15: posix-oneshot example
- [ ] Step 16: Go interop CI
- [ ] Step 17: driver contract ADR

## Blockers

None. Mark is installing Go locally, so step 16 runs locally first and then in GitHub Actions. I'll check `go version` before starting it.

## Follow-ups noted

- POSIX sequenced batch files are never deleted after integration, and the driver holds every batch in memory. Prune integrated batches with garbage collection (phase 8).

## Next Action

Write failing file fetcher tests.
