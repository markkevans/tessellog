# Learnings: Cloud drivers, migration and GC, static CT

Earlier learnings live in `CLAUDE.md` and `docs/adr/`.

## Gotchas

### Miniflare's proxy resets connections under thousands of concurrent reads
- **Context**: The conformance end-to-end check built 300 proofs concurrently, each reading tiles separately.
- **Issue**: `TypeError: fetch failed … ECONNRESET` from Miniflare's Node proxy.
- **Solution**: Share one read per tile path in the suite, as real clients cache tiles. Avoid unbounded fan-out against any remote store.

## Patterns That Worked

### Inject AWS failures with SDK middleware, not type hacks
- `client.middlewareStack.add((next) => async (args) => …, { step: "initialize" })` on a real client can fail one command type, such as `TransactWriteItems`, while everything else still reaches Floci.

### Parse DynamoDB items with Zod at the boundary
- `?? "0"` fallbacks on attributes would turn a damaged counter into "start again from 0", which reuses indices. Zod schemas make damage fail loudly, with no untested branches in our code.

## Decisions Made

### Floci instead of MinIO and DynamoDB Local
- **Context**: `minio/minio` and `quay.io/minio/minio` can no longer be pulled.
- **Decision**: Floci 2.4.0 (MIT, no auth token), suggested by Mark. One container serves S3 and DynamoDB on :4566, and it enforces DynamoDB conditional writes. Pinned to a release, not `latest`.

## Edge Cases
