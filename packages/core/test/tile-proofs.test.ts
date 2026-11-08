import { describe, expect, it } from "vitest";
import {
  inclusionProof,
  inclusionProofFromTiles,
  integrate,
  leafHash,
  tilePath,
  type TileAddress,
} from "../src/index.js";

const leafHashesFor = (count: number): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => leafHash(new TextEncoder().encode(`leaf ${i}`)));

const tileReaderFor = async (leafHashes: readonly Uint8Array[]) => {
  const { tiles } = await integrate({
    fromSize: 0n,
    leafHashes,
    readTile: async () => {
      throw new Error("an empty tree has no tiles");
    },
  });
  const store = new Map(tiles.map((tile) => [tilePath(tile), tile.hashes] as const));
  return async (address: TileAddress): Promise<Uint8Array> => {
    const hashes = store.get(tilePath(address));
    if (hashes === undefined) {
      throw new Error(`missing tile ${tilePath(address)}`);
    }
    return hashes;
  };
};

describe("building inclusion proofs from tiles", () => {
  it.each([1, 2, 3, 255, 256, 257, 600])(
    "matches the proof built from all leaves for every leaf of a %i-leaf tree",
    async (size) => {
      const leafHashes = leafHashesFor(size);
      const readTile = await tileReaderFor(leafHashes);
      const mismatches = await Promise.all(
        leafHashes.map(async (_, index) => {
          const fromTiles = await inclusionProofFromTiles({
            leafIndex: BigInt(index),
            treeSize: BigInt(size),
            readTile,
          });
          const fromLeaves = inclusionProof({ leafHashes, leafIndex: BigInt(index) });
          return JSON.stringify(fromTiles) === JSON.stringify(fromLeaves) ? [] : [index];
        }),
      );
      expect(mismatches.flat()).toEqual([]);
    },
  );

  it("reaches into level-1 tiles for trees beyond one full tile", async () => {
    const size = 70_000;
    const leafHashes = leafHashesFor(size);
    const readTile = await tileReaderFor(leafHashes);
    const fromTiles = await inclusionProofFromTiles({
      leafIndex: 12_345n,
      treeSize: BigInt(size),
      readTile,
    });
    expect(fromTiles).toEqual(inclusionProof({ leafHashes, leafIndex: 12_345n }));
  }, 20_000);

  it("refuses a leaf beyond the tree", async () => {
    await expect(
      inclusionProofFromTiles({
        leafIndex: 3n,
        treeSize: 3n,
        readTile: await tileReaderFor(leafHashesFor(3)),
      }),
    ).rejects.toThrow(RangeError);
  });
});
