# 2. Result values at trust boundaries, RangeError for programmer errors

- Status: accepted
- Date: 2026-11-08

## Context

Some inputs come from the network or storage (bundles, notes, checkpoints, tiles). Others come from the calling code (tile addresses, checkpoints to format, proof requests).

## Decision

- **Untrusted bytes:** parsing returns `Result<T>`, a discriminated union `{ ok: true, value } | { ok: false, error }`.
- **Invalid values from the calling code:** construction throws `RangeError`.
- **Appender options:** a Zod schema validates them. `createAppender` throws one error listing every problem.
- **Background failures:** integration and publication failures go to `onError`. They never surface through `add`.

## Consequences

Callers must check `ok` when handling network data, so malformed data can't crash a monitor. Programmer mistakes fail fast with a precise message.
