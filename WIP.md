# WIP: Cloud drivers, migration and GC, static CT

## Current Step

Step 1 of 20: An object-store driver core passes conformance on an in-memory object store.

## Status

🔴 RED - Writing failing test

## Completed

- [ ] Step 1: object-store driver core ← current
- [ ] Step 2: S3 object store (MinIO)
- [ ] Step 3: DynamoDB coordinator
- [ ] Step 4: AWS driver (conformance, restart, lease)
- [ ] Step 5: DynamoDB antispam store
- [ ] Step 6: R2 object store and D1 coordinator (Miniflare)
- [ ] Step 7: Cloudflare driver (conformance, restart, single writer, antispam)
- [ ] Step 8: CI service containers
- [ ] Step 9: obsolete partials in core
- [ ] Step 10: garbage collection
- [ ] Step 11: migration target
- [ ] Step 12: appender takes over a migrated log
- [ ] Step 13: migrate a Tessera log (interop)
- [ ] Step 14: reject oversized entries
- [ ] Step 15: pluggable entry layouts
- [ ] Step 16: RFC 6962 tree-head signatures
- [ ] Step 17: static-CT layout
- [ ] Step 18: client and migration read static CT
- [ ] Step 19: static-CT interop with Go
- [ ] Step 20: ADRs and docs

## Blockers

Docker daemon must be running for steps 2–5 (Mark is starting it).

## Next Action

Write the object-store driver contracts and failing tests.
