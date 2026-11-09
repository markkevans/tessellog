import { formatCheckpoint, inclusionProof, leafHash, rootHash, tilePath, verifyInclusion } from "@tessellog/core";

const leaves = ["a", "b", "c", "d", "e"].map((text) => leafHash(new TextEncoder().encode(text)));
const root = rootHash(leaves);

const proof = inclusionProof({ leafHashes: leaves, leafIndex: 3n });
const verified = verifyInclusion({ leafIndex: 3n, treeSize: 5n, leafHash: leaves[3] ?? new Uint8Array(), proof, rootHash: root });
console.log(verified.ok);

console.log(formatCheckpoint({ origin: "example.com/my-log", size: 5n, rootHash: root, extensions: [] }));
console.log(tilePath({ level: 0, index: 1234067n, width: 8 }));
