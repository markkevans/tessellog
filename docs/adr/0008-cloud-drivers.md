# 8. Cloud drivers: an object store plus a coordinator

- Status: accepted
- Date: 2026-11-09

## Context

Tessera's AWS driver uses S3 with Aurora MySQL. We wanted AWS and Cloudflare drivers that share as much as possible, and that can be tested locally.

## Decision

`@tessellog/driver-object-store` composes three contracts into a `LogDriver`:
- an **`ObjectStore`**: `get`, `put`, `delete` and `deleteMany`;
- a **`Coordinator`**: durable contiguous sequencing, reading sequenced entries back, tree state with compare-and-swap, and `forgetSequencedBefore`;
- a **`Lease`**: renewed on every integration, released on close.

Tiles and bundles are written before the tree state advances, so a lost compare-and-swap reveals a second writer.

**AWS (`@tessellog/driver-aws`)**
- Objects go in S3.
- The DynamoDB coordinator stores batch payloads in S3 under a random key, because DynamoDB items are capped at 400 KB.
- One `TransactWriteItems` call conditionally advances the counter and records the batch pointer. A crash can orphan a payload but never leave a gap.
- Lost races retry, and other errors stop.
- Items are validated with Zod.
- The lease is a conditional DynamoDB item. The antispam store keeps one item per identity, written with `attribute_not_exists`.

**Cloudflare (`@tessellog/driver-cloudflare`)**
- Objects go in R2.
- D1 runs each batch atomically against a single writer, so sequencing is one `INSERT … RETURNING` with no retry loop. Payloads live in R2.
- The lease and antispam store are D1 tables.
- The bindings are structural (`R2BucketLike`, `D1DatabaseLike`), so the package does not depend on `workers-types` at runtime.
- The recommended deployment runs the appender inside one Durable Object.

**Testing**
- AWS tests run against [Floci](https://github.com/floci-io/floci) 2.4.0, locally via `docker compose` and as a CI service container. MinIO's images are no longer published.
- Cloudflare tests use Miniflare's real R2 and D1.

## Consequences

- D1 binds and returns JS numbers as doubles. Indices therefore cross the D1 boundary as decimal text (`CAST(? AS INTEGER)` in, `CAST(… AS TEXT)` out) and stay exact up to SQLite's signed 64-bit limit, 2^63 − 1 entries. (Amended 2026-11-09; it was exact only to 2^53 before.)
- Object stores delete obsolete partials by enumerating the 255 possible widths in batches of 1,000 keys, which needs no `list` permission.
- The lease is fail-fast protection. Correctness rests on the transactions and the tree-state compare-and-swap.
