# 4. Stateful runtime code reassigns immutable values; core stays pure

- Status: accepted
- Date: 2026-11-08

## Context

The project prefers immutable data. Batching, pushback counters, publication state and the memory driver are inherently stateful.

## Decision

Keep state in closure-scoped `let` bindings, and replace them with new immutable values, for example `pending = [...pending, item]`. Never mutate arrays or objects in place. Everything in `@tessellog/core` stays pure.

## Consequences

State changes are explicit and local to one closure. The memory driver copies on every write, O(n) per batch. That's acceptable for tests. Persistent drivers write to storage instead.

## Amendment (2026-11-09): sealed mutable caches

Large caches and indices mutate a private `Map` that never leaves its module:
- the antispam LRU (`appender/src/dedup.ts`);
- the identity index shared by the antispam stores (`appender/src/identity-index.ts`);
- the memory witness store.

Copying a 262,144-entry map on every add would be O(n) per operation. The exception is limited to these modules, and their APIs stay immutable.
