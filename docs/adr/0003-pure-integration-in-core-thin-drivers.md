# 3. Integration is pure and lives in core; drivers stay thin

- Status: accepted
- Date: 2026-11-08

## Context

Tessera shares its tile-integration logic across storage drivers. tessellog will have memory, POSIX, AWS and Cloudflare drivers.

## Decision

`@tessellog/core` exports `integrate({ fromSize, leafHashes, readTile })`. It returns only the tiles that changed, plus the new root, computed from tiles alone. Entry bundling lives in the appender. A driver only needs to:
- sequence entries;
- read sequenced entries;
- report the tree state;
- read and write tiles, bundles and checkpoints.

The in-memory driver ships inside `@tessellog/appender` rather than as a separate package, which would have created a dependency cycle. The driver contract will be reviewed before the POSIX driver is built.

## Consequences

Each new driver is mostly persistence code. Correctness of the tree is tested once, in `core`, including batch-split equivalence and agreement with RFC 6962 roots.
