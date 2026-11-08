# Plan: Appender with in-memory driver

## Goal

A personality can add entries to a tessellog log and later verify, from the log's tiles and signed checkpoint alone, that each entry is included.

## Acceptance Criteria

- [ ] `add(entry)` resolves to a durable, contiguous index (`{ index, isDup: false }`) once the entry is sequenced.
- [ ] Sequenced entries are integrated: entry bundles and hash tiles are written in tlog-tiles layout.
- [ ] A signed checkpoint is published on an interval, and `openCheckpoint` accepts it.
- [ ] Root hashes computed from tiles alone match `rootHash` over all leaves.
- [ ] Batching (max size, max age), pushback and graceful shutdown match Tessera's defaults and semantics.
- [ ] Invalid options are rejected with clear errors (Zod at the options boundary).
- [ ] 100% coverage, strict types, every step TDD with test/feat/refactor commits.

## Design notes

- **Integration lives in `core` and is pure.** Given the previous tree size, a tile reader and the new leaf hashes, it returns the tiles to write and the new root. Drivers stay thin. This mirrors Tessera's shared `storage/internal` integration code.
- **The driver contract is discovered through tests, not designed up front.** The in-memory driver is the first implementation. The contract is reviewed before the POSIX driver (phase 4).
- **Time-dependent behaviour** (batch age, checkpoint interval) is tested with Vitest fake timers, never with real sleeps.

## Steps

### Step 1: Core computes which tiles make up a tree of a given size.

**Test**: `tilesForSize(70000n)` gives the tlog-tiles spec example: 273 full level-0 tiles, a level-0 partial of width 112, and so on through level 2.
**Implementation**: `tilesForSize` in `core/tiles.ts`.
**Done when**: the spec example and the edge cases (0, 256, 65536) pass.

### Step 2: Core integrates new leaves into tiles and returns the new root.

**Test**: integrating N leaves into an empty tree gives `rootHash` of those leaves. Level-0 tiles contain the leaf hashes, and each level-1 hash is the root of a full level-0 tile.
**Implementation**: a pure `integrate({ fromSize, readTile, leafHashes })` that returns `{ size, rootHash, tiles }`.
**Done when**: results match `rootHash` for sizes 0–600.

### Step 3: Integrating in batches gives the same tiles as integrating all at once.

**Test**: for several batch splittings of 1,000 leaves, the final tiles and root are identical, and each partial tile is replaced by its fuller successor.
**Implementation**: start integration from existing partial tiles read through `readTile`.
**Done when**: the batch-split test passes.

### Step 4: Scaffold `@tessellog/appender` with an in-memory driver that sequences entries.

**Test**: three `add` calls resolve to indices 0, 1, 2.
**Implementation**: package scaffold, `createAppender`, memory driver `sequence`.
**Done when**: the test passes and the workspace typechecks.

### Step 5: Sequenced entries are integrated into entry bundles and tiles.

**Test**: after adding entries and awaiting integration, the reader returns the entry bundle with those entries, and tiles whose root matches `rootHash`.
**Implementation**: an integration loop that calls core `integrate` and writes through the driver.
**Done when**: the reader test passes.

### Step 6: Signed checkpoints are published on the checkpoint interval.

**Test**: with fake timers, after the interval `openCheckpoint` accepts the stored checkpoint, and its size and root match the integrated tree.
**Implementation**: a publisher using `formatCheckpoint` and `signNote`.
**Done when**: the checkpoint is verifiable and is republished after the republish interval even when nothing changed.

### Step 7: Entries are proven included using only published tiles and the checkpoint.

**Test**: an end-to-end inclusion proof built from tiles verifies against the published checkpoint for every entry.
**Implementation**: core `inclusionProofFromTiles` (fetch-agnostic, using a tile reader).
**Done when**: inclusion verifies for logs of 1–600 entries.

### Step 8: Batches are flushed by size or by age.

**Test**: with fake timers, a full batch sequences immediately, and a partial batch sequences after `maxAge`.
**Implementation**: a batcher with `{ maxSize: 256, maxAge: 250 }` defaults.
**Done when**: both triggers are tested.

### Step 9: Too many outstanding entries are refused with pushback.

**Test**: past `maxOutstanding`, `add` rejects with a `Pushback` error, and accepts again once integration catches up.
**Implementation**: an outstanding counter, and a tagged error type.
**Done when**: the pushback test passes.

### Step 10: Shutdown integrates and publishes everything outstanding.

**Test**: after `shutdown()`, every added entry is covered by a published checkpoint, and later `add` calls reject.
**Implementation**: drain the batcher and integrator, run a final publication, then stop the timers.
**Done when**: the shutdown test passes with no dangling timers.

### Step 11: Invalid appender options are rejected.

**Test**: a missing signer, republish interval shorter than the checkpoint interval, mismatched signer names, and non-positive batch settings each give a descriptive error.
**Implementation**: a Zod options schema with defaults.
**Done when**: each validation is tested.

## Out of scope (later phases)

Antispam/dedup (phase 5), witnessing (phase 6), POSIX and cloud drivers (phases 4 and 7), migration and GC (phase 8), static-CT (phase 9), HTTP client fetching (phase 3).
