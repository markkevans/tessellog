# 5. The LogDriver contract

- Status: accepted
- Date: 2026-11-08

## Context

The memory and POSIX drivers now both pass `@tessellog/driver-conformance`, and a POSIX log interoperates with Tessera's Go implementation in both directions. Before we build the AWS and Cloudflare drivers (phase 7), we record what the contract promises and where it is weak.

## Decision

A `LogDriver` has eight methods.

**Sequencing**
- `sequence(entries)` makes a batch durable *before* resolving. It returns the batch's first index, and indices are contiguous across batches.
- `readSequenced(fromIndex)` returns sequenced entries from `fromIndex` onwards, in index order. Callers only ask from the integrated size or later.

**Tree state**
- `readTreeState()` returns `{ size, rootHash }` of the integrated tree. It starts at size 0 with the empty root.

**Tiles and bundles**
- `readTile` and `readEntryBundle` return `undefined` when an object is missing. They pass on any other failure.
- `writeIntegration({ size, rootHash, tiles, bundles })` writes tiles and bundles before the tree state. A crash then leaves only extra immutable objects, never a tree state that points at missing tiles.
- A partial tile and its fuller successors live at different paths, and older partials are kept.

**Checkpoints**
- `readCheckpoint` and `writeCheckpoint` hold the latest signed checkpoint. Each write replaces the previous one.

**Single writer**
- A driver is responsible for keeping one writer per log. The POSIX driver uses an exclusive lock file and releases it if opening fails.

**Validation**
- Integration and proof building validate tile lengths.
- The POSIX driver refuses to open on corrupt state rather than resetting, which would reuse indices.

## Consequences and known gaps

- **Unbounded state:** sequenced batches are never pruned, and the POSIX driver keeps every batch in memory. Garbage collection (phase 8) must delete batches at or below the integrated size, and readers must never need them.
- **Concurrent readers:** a reader may see a new tile before the tree state moves. This is harmless because tiles are immutable, and clients only trust tiles through a signed checkpoint.
- **Cloud drivers:** `sequence` needs an atomic "next index" (conditional writes, a SQL transaction, or a Durable Object). Single-writer safety needs leader election or compare-and-swap rather than a lock file. Tiles and bundles map directly to object storage at tlog-tiles paths.
- **Antispam (phase 5):** this will need a lookup from entry hash to index, alongside `sequence`. It belongs in a separate optional interface rather than in `LogDriver`.
