# @tessellog/core

The pure building blocks of tessellog's transparency logs:
- RFC 6962 Merkle hashing;
- the C2SP tlog-tiles layout;
- signed notes and checkpoints;
- inclusion and consistency proofs;
- keys, cosignatures and witness policies.

It does no I/O, so it runs in Node, Deno, Bun, Cloudflare Workers and browsers.

```sh
npm install @tessellog/core
```

Most applications use `@tessellog/appender` and `@tessellog/client`, which are built on this package. Use `core` directly to work with proofs, tiles or notes yourself:

<!-- snippet: core/proofs.ts -->
```ts
import { formatCheckpoint, inclusionProof, leafHash, rootHash, tilePath, verifyInclusion } from "@tessellog/core";

const leaves = ["a", "b", "c", "d", "e"].map((text) => leafHash(new TextEncoder().encode(text)));
const root = rootHash(leaves);

const proof = inclusionProof({ leafHashes: leaves, leafIndex: 3n });
const verified = verifyInclusion({ leafIndex: 3n, treeSize: 5n, leafHash: leaves[3] ?? new Uint8Array(), proof, rootHash: root });
console.log(verified.ok);

console.log(formatCheckpoint({ origin: "example.com/my-log", size: 5n, rootHash: root, extensions: [] }));
console.log(tilePath({ level: 0, index: 1234067n, width: 8 }));
```

## API

| Area | Exports |
|---|---|
| Hashing | `leafHash`, `nodeHash`, `rootHash`, `HASH_BYTES` |
| Proofs | `inclusionProof`, `consistencyProof` (from leaves), `inclusionProofFromTiles`, `consistencyProofFromTiles`, `verifyInclusion`, `verifyConsistency` |
| Tiles | `tilePath`, `entriesPath`, `tileLayout`, `TILE_WIDTH`, `encodeBundle`, `decodeBundle`, `integrate`, plus the garbage-collection helpers `tilesFilledBetween`, `partialPathsOf` and `partialPrefixesOf` |
| Keys | `generateNoteKey`, `parseSignerKey`, `parseVerifierKey`, `parseCosignerKey`, `parseCosignerVerifierKey`, `cosignatureVerifierKeyFrom`, `createRFC6962Signer`, `parseRFC6962VerifierKey`, `rfc6962VerifierKey`, `p256PublicKeyInfo` |
| Notes and checkpoints | `signNote`, `openNote`, `formatCheckpoint`, `parseCheckpoint`, `openCheckpoint` |
| Witness policies | `parsePolicy`, `policySatisfied`, `describeCosigners` |
| Utilities | `Result`, `encodeBase64`, `decodeBase64`, `toHex` |

Anything that parses untrusted input returns a `Result<T>`: either `{ ok: true, value }` or `{ ok: false, error }`. Indices and sizes are `bigint`.

Guides: [concepts](https://github.com/markkevans/tessellog/blob/main/docs/guides/concepts.md) and [keys and signing](https://github.com/markkevans/tessellog/blob/main/docs/guides/keys-and-signing.md).

## Licence

Apache-2.0. Part of [tessellog](https://github.com/markkevans/tessellog), a TypeScript port of [Tessera](https://github.com/transparency-dev/tessera). See NOTICE for attribution.
