# WIP: Antispam (phase 5) and witnessing (phase 6)

## Current Step

Step 1 of 14: In-memory dedup returns the original index for a repeated entry.

## Status

🔴 RED - Writing failing test

## Completed

- [ ] Step 1: in-memory dedup ← current
- [ ] Step 2: persistent store lookup
- [ ] Step 3: follower populates the store
- [ ] Step 4: antispam pushback
- [ ] Step 5: antispam options and store conformance
- [ ] Step 6: POSIX antispam store
- [ ] Step 7: Ed25519 checkpoint cosignatures
- [ ] Step 8: tlog-policy parsing and quorum
- [ ] Step 9: witness add-checkpoint server
- [ ] Step 10: witness client with 409 recovery
- [ ] Step 11: appender publishes only witnessed checkpoints
- [ ] Step 12: client requires a quorum
- [ ] Step 13: witnessing interop with Go/Tessera
- [ ] Step 14: ADRs and docs

## Blockers

None.

## Next Action

Write failing in-memory dedup tests.
