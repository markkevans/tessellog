# WIP: Antispam (phase 5) and witnessing (phase 6)

## Current Step

Step 9 of 14: `@tessellog/witness` serves a spec-conformant `add-checkpoint`.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: in-memory dedup
- [x] Step 2: persistent store lookup
- [x] Step 3: follower populates the store
- [x] Step 4: antispam pushback (Tessera default 2048, lag > threshold)
- [x] Step 5: antispam options and store conformance (characterisation, passed on first run)
- [x] Step 6: POSIX antispam store
- [x] Step 7: Ed25519 checkpoint cosignatures (byte-identical with Go formats/note)
- [x] Step 8: tlog-policy parsing and quorum
- [ ] Step 9: witness add-checkpoint server ← current
- [ ] Step 10: witness client with 409 recovery
- [ ] Step 11: appender publishes only witnessed checkpoints
- [ ] Step 12: client requires a quorum
- [ ] Step 13: witnessing interop with Go/Tessera
- [ ] Step 14: ADRs and docs

## Blockers

None.

## Next Action

Scaffold @tessellog/witness and write failing add-checkpoint tests.
