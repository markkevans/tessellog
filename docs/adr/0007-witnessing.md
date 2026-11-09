# 7. Witnessing with Ed25519 cosignatures and tlog-policy

- Status: accepted
- Date: 2026-11-09

## Context

C2SP `tlog-witness` defines how logs obtain cosignatures, `tlog-cosignature` defines their format, and `tlog-policy` defines quorums. Tessera v1.0.4 implements witnessing with Ed25519 cosignatures (`0x04`) and a Sigsum/`tlog-policy` file. The spec recommends ML-DSA-44 (`0x06`) for new witnesses.

## Decision

**Core**
- Ed25519 `cosignature/v1` signing and verification, byte-identical with `transparency-dev/formats/note`.
- Cosigner verifier keys must be `0x04`, with a validated key ID.
- `cosignatureVerifierKeyFrom` converts a standard key, as Go's `VKeyToCosignatureV1` does.

**Policies**
- `parsePolicy` follows the spec's rules, and `policySatisfied` evaluates the quorum tree.
- Witness keys must be `0x04`, and reserved keywords cannot be names, both as in Tessera.

**`@tessellog/witness`**
- A fetch-style `add-checkpoint` handler that checks requests in the spec's order (400, 404, 403, 400, 409, 422).
- It cosigns only after an atomic compare-and-swap on the `WitnessStore`, which prevents rollback races.
- A client that tracks the witness's size, retries once after a 409, refuses to roll a witness back, and returns only verified cosignatures.

**Appender**
- `witnessing: { policy, timeout = 1000, failOpen = false, fetch }` asks every policy witness in parallel and publishes only when the quorum is met, unless `failOpen` is set. Policy witnesses must have URLs.

**Client**
- `witnessPolicy` makes `latestCheckpoint` require the quorum.

**Interop (CI)**
- Tessera's `posix-oneshot` is witnessed by our witness over HTTP. Tessera's Go code verifies our cosignatures, and our client checks the quorum.
- Go's `formats/note` verifies cosignatures on a tessellog-written log.

## Consequences and known gaps

- **No ML-DSA-44 yet.** Tessera v1.0.4 does not accept such witness keys and we have no reference vectors. It is the next witnessing step, likely via `@noble/post-quantum`, once vectors exist.
- **No `sign-subtree`.** It is optional in the spec.
- **No persistent witness store.** Only `createMemoryWitnessStore` exists. A production witness needs a durable compare-and-swap store, such as POSIX or a database.
- **Untested against a Go witness.** Our witness *client* has been exercised against our own witness but not against a Go witness implementation.
