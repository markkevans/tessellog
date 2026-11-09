# WIP: Cloud drivers, migration and GC, static CT

## Current Step

Step 14 of 20: Oversized entries are rejected at add.

## Status

🔴 RED - Writing failing test

## Completed

- [x] Step 1: object-store driver core
- [x] Step 2: S3 object store (Floci)
- [x] Step 3: DynamoDB coordinator (Floci): counter + batch pointers in one transaction, payloads in the object store
- [x] Step 4: AWS driver (conformance, restart, lease renewed on integration)
- [x] Step 5: DynamoDB antispam store
- [x] Step 6: R2 object store and D1 coordinator (Miniflare; payloads in R2, D1 rows hold pointers)
- [x] Step 7: Cloudflare driver (conformance, restart, single writer, antispam)
- [x] Step 8: CI Floci service container (brought forward to step 2 so main stays green)
- [x] Step 9: obsolete partials in core (tiles that became full; all their .p/ widths go, as in Tessera)
- [x] Step 10: garbage collection (10a–c together in one GREEN, since the contract requires it; 10d appender interval)
- [x] Step 11: migration target
- [x] Step 12: appender takes over a migrated log (characterisation, passed on first run)
- [x] Step 13: migrate a Tessera log (interop)
- [ ] Step 14: reject oversized entries ← current
- [ ] Step 15: pluggable entry layouts
- [ ] Step 16: RFC 6962 tree-head signatures
- [ ] Step 17: static-CT layout
- [ ] Step 18: client and migration read static CT
- [ ] Step 19: static-CT interop with Go
- [ ] Step 20: ADRs and docs

## Blockers

None. Docker is running; Floci 2.4.0 serves S3 and DynamoDB on :4566.

## Next Action

Write failing entry size tests.
