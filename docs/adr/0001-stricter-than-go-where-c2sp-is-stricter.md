# 1. Follow the C2SP specs where they are stricter than Go

- Status: accepted
- Date: 2026-11-08

## Context

Tessera's Go dependencies (`golang.org/x/mod/sumdb/note`, `transparency-dev/formats/log`) accept some input that the C2SP specs forbid:
- checkpoint sizes with leading zeros;
- root hashes of any length;
- blank extension lines;
- non-canonical base64;
- note text that their own `Open` would then reject.

## Decision

tessellog follows the spec:
- **Checkpoints:** a canonical decimal size, a 32-byte root hash and non-empty extension lines.
- **Notes:** base64 must be canonical. `signNote` rejects text that `openNote` would reject: no trailing newline, control characters, invalid UTF-8, or no signers.

Otherwise we match Go's behaviour, including the 100-signature cap, rejecting a consistency proof from size 0, and duplicate-signature handling.

## Consequences

We may reject a log that Go accepts but that violates the spec. We never produce output that Go rejects. Go reference vectors still pass wherever they are spec-valid.
