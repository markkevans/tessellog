# WIP: Client (phase 3), POSIX driver and interop (phase 4)

## Current Step

Step 8 of 17: CI runs typecheck and coverage on every push.

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
- [ ] Step 8: CI workflow (Node 22 and 24: Node 20 is end-of-life) ← current
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

Push the CI workflow and watch the first run.
