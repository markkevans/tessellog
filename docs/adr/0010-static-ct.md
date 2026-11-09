# 10. Static CT: the data layer, through pluggable layouts

- Status: accepted
- Date: 2026-11-09

## Context

Tessera provides the static-ct-api *data layer* (`ctonly`, `WithCTLayout`). X.509 parsing and `add-chain` live in CT personalities such as Sunlight. In this layer, both the entry bundle bytes (`TileLeaf`) and the leaf hash (`MerkleTreeLeaf`) embed the entry's index as a `leaf_index` extension.

## Decision

**Layouts**
- The appender routes entry handling through an `EntryLayout`. It defines encoding and hashing by index, bundle decoding, identity, validation, the size limit and the bundle path.
- `tlogTilesLayout` is the default.
- Drivers take a matching `entriesPath`. The client and fetchers take a structural layout, so they need no appender dependency.

**`@tessellog/static-ct`**
- `CtEntry` is a discriminated union, so precertificates always carry their fields.
- `encodeTileLeaf`, `merkleTreeLeafHash` and `ctIdentity` match Go `ctonly` byte for byte.
- `decodeTileLeaves` rejects truncation, unknown entry types, unexpected extensions and partial fingerprints.
- `staticCtLayout` writes to `tile/data`, allows 256 KiB entries, validates submissions at `add` and deduplicates by certificate, as Tessera does.
- `encodeCtSubmission` gives the bytes a personality passes to `add`.

**`core`**
- RFC 6962 tree-head note signatures (`0x05`, ECDSA P-256).
- Verifies a real checkpoint from the Rome static-CT log.
- Formats verifier keys exactly as Go's `RFC6962VerifierString`.
- Accepts high-S signatures as Go does.
- Signs and verifies only the log's own checkpoints, without extensions.

**Interop (CI)**
- Tessera's `ctonly` matches every `TileLeaf` tessellog writes, and `formats/note` and Tessera's client verify the log.
- tessellog's client verifies a static-CT log written by Tessera's CT appender.

## Consequences

- RSA RFC 6962 keys are not supported. Go supports them, but static CT uses P-256.
- The static-ct-api `issuer/` endpoint and the `add-chain` endpoint are left to personalities.
