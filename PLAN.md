# Plan: Cloud drivers (phase 7), migration and GC (phase 8), static CT (phase 9)

## Goal

tessellog logs run on AWS (S3 + DynamoDB) and Cloudflare (R2 + D1), can be migrated in from any tlog-tiles log, clean up obsolete partials, and can serve the static-CT data layer that Tessera provides, all interoperable with Tessera.

## Decisions (agreed 2026-11-09)

- **AWS:** S3 holds objects; DynamoDB handles sequencing, tree state, a single-writer lease and antispam. Tests run against MinIO and DynamoDB Local in Docker, locally and as CI service containers.
- **Cloudflare:** R2 holds objects; D1 handles sequencing, tree state and antispam. Tests use Miniflare's real R2 and D1, with no Docker.
- **Static CT:** the data layer only, like Tessera (`ctonly`):
  - entries, `MerkleTreeLeaf` hashing and `tile/data` bundles;
  - RFC 6962 tree-head note signatures (`0x05`);
  - the 256 KiB entry limit.
  No X.509 parsing and no `add-chain` endpoint.

## Sources

Tessera v1.0.4: `storage/aws`, `storage/posix/files.go` (GC), `migrate_lifecycle.go`, `ct_only.go`, `ctonly/ct.go`, `docs/design/lifecycle.md`. `transparency-dev/formats/note` (`note_rfc6962.go`). C2SP `static-ct-api`.

## Acceptance Criteria

- [ ] A shared object-store driver core passes `describeLogDriver` on in-memory, S3 (MinIO) and R2 (Miniflare) object stores.
- [ ] The AWS and Cloudflare drivers persist sequencing and tree state durably with compare-and-swap, survive restarts, enforce a single writer, and provide antispam stores passing `describeAntispamStore`.
- [ ] Garbage collection removes obsolete partial tiles, partial bundles and integrated sequencing state, and clients still verify old checkpoints via full-tile fallback.
- [ ] A migration target imports a tlog-tiles log (including a Tessera-written one), verifies the source root, publishes nothing until an appender takes over, and the result stays consistent.
- [ ] Oversized entries are rejected at `add` (64 KiB for tlog-tiles, 256 KiB for static CT).
- [ ] The static-CT layout matches Go `ctonly` byte for byte, RFC 6962 tree-head signatures match Go `formats/note`, and Tessera's Go code verifies a tessellog static-CT log.
- [ ] 100% coverage, TDD, commits gated on exit codes, pushed only when green, CI green including the new service containers.

## Steps

### Phase 7: Cloud drivers

1. **An object-store driver core passes conformance on an in-memory object store.**
   `ObjectStore` (get, put, delete) and `Coordinator` (sequence, read sequenced, tree state with compare-and-swap) contracts, composed into a `LogDriver`.
2. **An S3 object store passes the ObjectStore contract against MinIO.**
   Uses the AWS SDK v3 `S3Client`, with `docker compose` for local services.
3. **A DynamoDB coordinator passes the Coordinator contract against DynamoDB Local.**
   Conditional writes on the next index, batches stored as items, compare-and-swap on tree state.
4. **The AWS driver passes LogDriver conformance, survives restarts and enforces a single writer with a DynamoDB lease.**
5. **A DynamoDB antispam store passes `describeAntispamStore`.**
6. **An R2 object store and a D1 coordinator pass their contracts under Miniflare.**
7. **The Cloudflare driver passes LogDriver conformance, survives restarts, enforces a single writer and provides a D1 antispam store.**
8. **CI runs the cloud suites with MinIO and DynamoDB Local service containers.**

### Phase 8: Garbage collection and migration

9. **Core lists the partial tiles and bundles made obsolete between two tree sizes.**
10. **Drivers can garbage-collect, and the appender runs it on an interval up to the published size.**
    Default 60s, 0 disables. POSIX and the object-store drivers delete partials and integrated sequencing state, and the memory driver drops them.
11. **A migration target imports a tlog-tiles log, verifies the source root and publishes no checkpoint.**
    Bundles come from a `LogFetcher`, antispam can be populated, and a root mismatch fails.
12. **An appender takes over a migrated log and stays consistent with the source.**
13. **Interop: tessellog migrates in a log written by Tessera's posix-oneshot.**

### Phase 9: Static CT

14. **Oversized entries are rejected at add.**
    `EntryTooLargeError` at 64 KiB by default.
15. **Entry layouts become pluggable without changing tlog-tiles behaviour.**
    `entriesPath`, leaf hashing, bundle encoding, identity and size limit.
16. **Core signs and verifies RFC 6962 tree-head note signatures (`0x05`, ECDSA P-256), matching Go `formats/note`.**
17. **A static-CT layout matches Go `ctonly` byte for byte.**
    `TileLeaf` encoding, `MerkleTreeLeaf` hashing with the leaf-index extension, `tile/data` paths, the 256 KiB limit and CT identity hashing.
18. **The client and migration target read static-CT logs.**
19. **Interop: Tessera's Go code verifies a tessellog static-CT log.**
20. **Record decisions.**
    ADR 8 (cloud driver design), ADR 9 (GC and migration), ADR 10 (static CT), plus README and `CLAUDE.md`.

## Out of scope

GCP and MySQL drivers. X.509 parsing and `add-chain`. Mirroring. ML-DSA-44 cosignatures (ADR 7).
