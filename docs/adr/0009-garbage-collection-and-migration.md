# 9. Garbage collection and migration

- Status: accepted
- Date: 2026-11-09

## Garbage collection

`LogDriver.collectGarbage(upToSize)` follows Tessera:
- Once a tile becomes full, every partial width of that tile and of its entry bundle is deleted. `core`'s `tilesFilledBetween` and `partialPathsOf` / `partialPrefixesOf` work out which.
- Drivers also forget integrated sequencing state, and track their progress durably (`.state/gc`).
- The POSIX driver always keeps the batch that anchors its next index.

The appender collects up to the **published** checkpoint size, every 60 seconds by default (0 disables it), and never before a checkpoint is published. Clients holding older checkpoints keep working through the full-tile fallback in the client and migration target.

## Migration

`createMigrationTarget({ driver, antispam?, layout? }).migrate({ readEntryBundle, sourceSize, sourceRoot })`:
- copies the source's bundles into the same indices;
- integrates as it goes, falling back to full bundles when partials are gone;
- can populate antispam, and resumes where it stopped;
- **publishes no checkpoint**, so only one log is canonical;
- returns a failure unless the final root equals the source root.

An appender can then take over the target. CI migrates a log written by Tessera's `posix-oneshot`, appends to it, and Tessera's Go client verifies consistency with Tessera's original checkpoint.
