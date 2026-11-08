# Plan: Antispam (phase 5) and witnessing (phase 6)

## Goal

Duplicate submissions are deduplicated on a best-effort basis, as in Tessera. Checkpoints are only published once a configured witness quorum has cosigned them, interoperating with Tessera's witness support in both directions.

## Sources

- Tessera v1.0.4: `antispam.go`, `lifecycle.go` (`Antispam`, `Follower`), `docs/design/antispam.md`, `witness.go`.
- C2SP `tlog-cosignature`, `tlog-witness` and `tlog-policy` (editor's copies, fetched 2026-11-08).

## Acceptance Criteria

- [ ] Re-adding a recently seen entry returns its original index with `isDup: true`, without sequencing it again.
- [ ] A persistent antispam store, populated by following the integrated log, catches duplicates across appender restarts. Adds push back when the follower lags.
- [ ] The memory and POSIX antispam stores both pass a shared conformance suite.
- [ ] Core opens notes carrying Ed25519 checkpoint cosignatures (type `0x04`), matching Go's `formats/note` vectors.
- [ ] Core parses `tlog-policy` files and decides whether a set of cosignatures satisfies the quorum.
- [ ] `@tessellog/witness` provides a spec-conformant `add-checkpoint` witness (as a fetch-style handler) and a client for it.
- [ ] The appender publishes only policy-satisfying checkpoints (optionally fail-open), and the client can require a quorum.
- [ ] Interop: Go `formats/note` verifies our cosignatures, and Tessera's `posix-oneshot --witness_policy_file` gets its checkpoint cosigned by our witness.
- [ ] 100% coverage, TDD with test/feat/refactor commits, pushed only when green.

## Steps

### Phase 5: Antispam

1. **In-memory dedup returns the original index for a repeated entry.**
   Test: a duplicate gives `{ index, isDup: true }` and sequences only once. Concurrent duplicates share one sequencing. A failed add is not cached. The oldest entries are evicted past the capacity.
2. **A persistent antispam store is consulted before sequencing.**
   Test: an entry the store knows returns its stored index with `isDup: true`. Lookup uses SHA-256 identity hashes, as in Tessera.
3. **A follower populates the store from integrated entry bundles.**
   Test: after integration, a fresh appender sharing the store detects the duplicate. The follower's progress survives restart.
4. **Adds push back when the follower lags.**
   Test: past `pushbackThreshold` unfollowed entries, `add` rejects with `PushbackAntispamError`, and accepts again once the follower catches up.
5. **Antispam options are validated and the memory store passes a conformance suite.**
   Test: `antispam: { inMemoryEntries, store, pushbackThreshold }` with defaults and Zod validation, and `describeAntispamStore` against the memory store.
6. **The POSIX driver offers a persistent antispam store.**
   Test: it passes the conformance suite, survives reopening, and refuses a corrupt store.

### Phase 6: Witnessing

7. **Core parses cosigner keys and opens notes with Ed25519 checkpoint cosignatures.**
   Test: Go `formats/note` cosignature vectors verify. A wrong timestamp, origin or body fails. Signing produces Go-identical output.
8. **Core parses `tlog-policy` files and evaluates quorums.**
   Test: the spec's example policy covers `any`, `all`, numeric thresholds, nesting, `quorum none` and optional URLs. Malformed policies are rejected with clear errors.
9. **`@tessellog/witness` serves a spec-conformant `add-checkpoint`.**
   Test: every status code in `tlog-witness` (200, 400, 403, 404, 409 with `text/x.tlog.size`, 422). Atomic size updates, and monotonic cosigning.
10. **A witness client submits checkpoints and recovers from a size conflict.**
    Test: it cosigns against our witness, and on a 409 it retries from the witness's size with a fresh consistency proof.
11. **The appender only publishes checkpoints that satisfy the witness policy.**
    Test: met, unmet (nothing published), fail-open, witness timeouts, and cosignature lines merged into the published checkpoint.
12. **The client can require a witness quorum when opening checkpoints.**
    Test: a satisfied policy opens, and an unsatisfied one fails with the missing quorum named.
13. **Interop: Go verifies our cosignatures, and Tessera's posix-oneshot is witnessed by our witness.**
    Test: extend `interop/run.sh` and the CI job.
14. **Record antispam and witnessing decisions.**
    ADR 6 (antispam layering) and ADR 7 (witnessing, plus ML-DSA-44 status), README and `CLAUDE.md`.

## Out of scope

- **ML-DSA-44 cosignatures (type `0x06`):** the spec recommends them for new witnesses, but Tessera v1.0.4 accepts only Ed25519 witness keys, and I have no reference vectors yet. ADR 7 records this as the next witnessing step.
- **`sign-subtree`** (optional in the spec).
- **Mirroring.**
