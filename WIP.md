# WIP: Client (phase 3), POSIX driver and interop (phase 4)

## Current Step

Step 4 of 17: The client opens the latest checkpoint and verifies its signature and origin.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: consistency proofs from tiles
- [x] Step 2: HTTP fetcher
- [x] Step 3: partial tile fallback
- [ ] Step 4: open the latest checkpoint ← current
- [ ] Step 5: prove inclusion
- [ ] Step 6: check consistency
- [ ] Step 7: stream verified entries
- [ ] Step 8: CI workflow
- [ ] Step 9: driver conformance suite
- [ ] Step 10: POSIX driver
- [ ] Step 11: POSIX restart persistence
- [ ] Step 12: POSIX single-writer lock
- [ ] Step 13: tile length validation
- [ ] Step 14: client file fetcher
- [ ] Step 15: posix-oneshot example
- [ ] Step 16: Go interop CI
- [ ] Step 17: driver contract ADR

## Blockers

None. Mark is installing Go locally, so step 16 runs locally first and then in GitHub Actions. I'll check `go version` before starting it.

## Next Action

Write failing latestCheckpoint tests.
