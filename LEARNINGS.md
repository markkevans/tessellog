# Learnings: Cloud drivers, migration and GC, static CT

Earlier learnings live in `CLAUDE.md` and `docs/adr/`.

## Gotchas

## Patterns That Worked

## Decisions Made

### Floci instead of MinIO and DynamoDB Local
- **Context**: `minio/minio` and `quay.io/minio/minio` can no longer be pulled.
- **Decision**: Floci 2.4.0 (MIT, no auth token), suggested by Mark. One container serves S3 and DynamoDB on :4566, and it enforces DynamoDB conditional writes. Pinned to a release, not `latest`.

## Edge Cases
