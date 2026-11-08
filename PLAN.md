# Plan: Client (phase 3), POSIX driver and interop (phase 4)

## Goal

A verifier can follow any tessellog log over HTTP or from disk, and a log written by tessellog's POSIX driver is accepted by Tessera's own Go client, and vice versa.

## Acceptance Criteria

- [ ] `@tessellog/client` opens and verifies checkpoints, proves inclusion, checks consistency between checkpoints and streams verified entries, over HTTP (injected `fetch`) or from a local directory.
- [ ] The client falls back to the full tile when a partial tile is gone (tlog-tiles).
- [ ] A shared driver conformance suite passes for both the memory and POSIX drivers.
- [ ] The POSIX driver survives restarts (indices continue, tree state is kept), writes atomically, and refuses a second writer.
- [ ] Integration rejects tiles from storage with the wrong length.
- [ ] A `posix-oneshot` example builds a log from files.
- [ ] CI runs typecheck and 100% coverage on every push. A Go interop job proves that Tessera's client verifies our log and our client verifies Tessera's log.
- [ ] Every step is TDD, committed and pushed with test/feat/refactor commits.

## Steps

### Phase 3: `@tessellog/client`

#### Step 1: Core builds consistency proofs from tiles.
**Test**: `consistencyProofFromTiles` equals `consistencyProof` over all leaves at tile-boundary sizes.
**Implementation**: reuse the subtree hasher with the RFC 6962 `SUBPROOF` recursion.
**Done when**: boundary sizes and the 70,000-leaf case match.

#### Step 2: An HTTP fetcher reads checkpoints, tiles and bundles through an injected `fetch`.
**Test**: against an in-memory "server" backed by an appender's reader. A 404 gives `undefined`, and other failures give a descriptive error.
**Implementation**: `createHttpFetcher({ baseUrl, fetch })`.
**Done when**: each resource type and each error path is tested.

#### Step 3: The fetcher falls back to the full tile when a partial tile is missing.
**Test**: delete a partial tile from the server, and the read returns the first `width` hashes of the full tile.
**Implementation**: on a 404 for `.p/W`, fetch the full tile and slice it.
**Done when**: tiles and entry bundles both fall back.

#### Step 4: The client opens the latest checkpoint and verifies its signature and origin.
**Test**: a valid checkpoint opens. A wrong origin, wrong key or missing checkpoint gives a `Result` failure.
**Implementation**: `createLogClient({ fetcher, origin, logVerifier, otherVerifiers })` and `latestCheckpoint()`.
**Done when**: each case is tested.

#### Step 5: The client proves an entry is included in a checkpoint.
**Test**: every entry of a published log verifies, and a wrong entry or index fails.
**Implementation**: `proveInclusion({ entry, index, checkpoint })` using `inclusionProofFromTiles`.
**Done when**: the end-to-end test passes for 1–600 entries.

#### Step 6: The client checks that a newer checkpoint is consistent with an older one.
**Test**: real growth verifies, while a forked log (different entries at the same size) and a shrinking log fail.
**Implementation**: `checkConsistency(older, newer)` using `consistencyProofFromTiles`.
**Done when**: the fork detection test passes.

#### Step 7: The client streams entries in a range and verifies them against the tiles.
**Test**: streaming `[from, to)` across bundle boundaries yields the entries in order, and a tampered bundle is rejected.
**Implementation**: an async iterator over bundles that checks leaf hashes against level-0 tiles.
**Done when**: ranges, boundaries and tampering are tested.

#### Step 8: CI runs typecheck and coverage on every push.
**Test**: the workflow passes on GitHub (checked with `gh run watch`).
**Implementation**: `.github/workflows/ci.yml` (Node 20 and 24).
**Done when**: the first run is green.

### Phase 4: POSIX driver, conformance and interop

#### Step 9: A shared conformance suite specifies the driver contract and passes for the memory driver.
**Test**: `describeLogDriver(name, createDriver)` covers sequencing, tree state, tiles, bundles and checkpoints.
**Implementation**: a private `@tessellog/driver-conformance` package.
**Done when**: the memory driver passes.

#### Step 10: The POSIX driver stores a log in a directory at tlog-tiles paths and passes conformance.
**Test**: the conformance suite against a temp directory, with files at the tlog-tiles paths.
**Implementation**: `@tessellog/driver-posix` with atomic write-then-rename.
**Done when**: conformance passes, and an appender on POSIX publishes a verifiable log.

#### Step 11: The POSIX driver keeps sequencing and tree state across restarts.
**Test**: reopen the directory, and new entries continue from the last index with a consistent checkpoint.
**Implementation**: persisted sequencing and tree-state files.
**Done when**: the restart test passes.

#### Step 12: The POSIX driver refuses a second writer on the same directory.
**Test**: opening twice fails until the first driver is closed.
**Implementation**: an exclusive lock file and `close()`.
**Done when**: the lock tests pass.

#### Step 13: Integration rejects tiles from storage with the wrong length.
**Test**: a driver returning a truncated partial tile triggers a reported integration error.
**Implementation**: a length check in core `integrate` and the subtree hasher.
**Done when**: tested for both integration and proof building.

#### Step 14: The client reads a POSIX log directly from disk.
**Test**: appender, then POSIX directory, then a file fetcher, then the client verifies inclusion and consistency.
**Implementation**: `createFileFetcher(root)` in the client (Node only, separate export).
**Done when**: the end-to-end test passes.

#### Step 15: A `posix-oneshot` example adds files to a log directory.
**Test**: running it twice over files extends the log, and the client verifies every entry.
**Implementation**: `examples/posix-oneshot` CLI.
**Done when**: the example test passes.

#### Step 16: CI proves interop with Tessera's Go implementation.
**Test**: a Go program using `tessera/client` verifies a tessellog POSIX log. Our client verifies a log written by Tessera's `posix-oneshot`.
**Implementation**: `interop/go` and a CI job using `actions/setup-go`.
**Done when**: the job is green on GitHub.

#### Step 17: Review and record the driver contract before cloud drivers.
**Test**: none (docs only).
**Implementation**: ADR 5 on the driver contract, plus README updates.
**Done when**: the ADR is committed.

## Out of scope

Antispam (phase 5), witnessing (phase 6), cloud drivers (phase 7), migration and GC (phase 8), static-CT (phase 9).
