# Cosignature vectors

Generated on 2026-11-08 with `github.com/transparency-dev/formats/note`
(`v0.0.0-20251017110053-404c0d5b696c`, the version Tessera v1.0.4 depends on).
The generator was a throwaway Go program that called:

- `NewSignerForCosignatureV1` with the `WitnessOne` fixture signer key;
- `note.Sign` over the checkpoint body in `fixtures/cosignatures.ts`;
- `VKeyToCosignatureV1` with the `WitnessOne` fixture verifier key.

The output is copied unchanged into `fixtures/cosignatures.ts`.
