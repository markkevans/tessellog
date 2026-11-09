# WIP: Cloud drivers, migration and GC, static CT

## Current Step

Step 3 of 20: A DynamoDB coordinator passes the Coordinator contract against Floci.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: object-store driver core
- [x] Step 2: S3 object store (Floci)
- [ ] Step 3: DynamoDB coordinator (Floci): counter + batch pointers in one transaction, payloads in the object store ← current
- [ ] Step 4: AWS driver (conformance, restart, lease)
- [ ] Step 5: DynamoDB antispam store
- [ ] Step 6: R2 object store and D1 coordinator (Miniflare)
- [ ] Step 7: Cloudflare driver (conformance, restart, single writer, antispam)
- [x] Step 8: CI Floci service container (brought forward to step 2 so main stays green)
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

None. Docker is running; Floci 2.4.0 serves S3 and DynamoDB on :4566.

## Next Action

Write failing DynamoDB coordinator tests.
