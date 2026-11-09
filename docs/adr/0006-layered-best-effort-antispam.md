# 6. Layered, best-effort antispam

- Status: accepted
- Date: 2026-11-09

## Context

Tessera reduces duplicate submissions on a best-effort basis (`antispam.go`, `docs/design/antispam.md`). It explicitly does not guarantee uniqueness. Applications that need strict deduplication must handle it themselves.

## Decision

We mirror Tessera's layering. `antispam: { inMemoryEntries, store?, pushbackThreshold }` turns it on.

1. **In-memory LRU:** keyed by the entry's SHA-256 identity, with a default capacity of 262,144. It holds the original add's promise, so concurrent duplicates share one sequencing. Failed adds are forgotten so they can be retried.
2. **Persistent `AntispamStore`:** `lookup`, `followedSize` and `record`. It is consulted only on in-memory misses.
3. **Follower:** fills the store asynchronously from integrated entry bundles. It runs after each integration and at shutdown, one bundle per `record` call. Stores keep the first index seen for an identity.
4. **Pushback:** while `integrated size - followedSize > pushbackThreshold` (default 2,048, a strict comparison as in Tessera), adds reject with `PushbackAntispamError`. It subclasses `PushbackError`, as `ErrPushbackAntispam` wraps `ErrPushback`.

There are two stores: in memory (`@tessellog/appender`), and POSIX append-only segments (`@tessellog/driver-posix`). Both pass `describeAntispamStore`.

## Consequences

- Duplicates can still be logged during follower lag or after in-memory eviction. This is by design.
- The in-memory caches mutate a sealed `Map` (see ADR 4's amendment).
- POSIX segments are never compacted. Compaction belongs with garbage collection (phase 8).
