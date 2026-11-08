# 4. Stateful runtime code reassigns immutable values; core stays pure

- Status: accepted
- Date: 2026-11-08

## Context

The project prefers immutable data. Batching, pushback counters, publication state and the memory driver are inherently stateful.

## Decision

Keep state in closure-scoped `let` bindings, and replace them with new immutable values, for example `pending = [...pending, item]`. Never mutate arrays or objects in place. Everything in `@tessellog/core` stays pure.

## Consequences

State changes are explicit and local to one closure. The memory driver copies on every write, O(n) per batch. That's acceptable for tests. Persistent drivers write to storage instead.
