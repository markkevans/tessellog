import { describe, expect, it } from "vitest";
import {
  consistencyProof,
  consistencyProofFromTiles,
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
  const boundaryIndices = (size: number): readonly number[] =>
    [...new Set([0, 1, 127, 128, 255, 256, 257, 511, 512, size - 2, size - 1])].filter(
      (index) => index >= 0 && index < size,
    );

  it.each([1, 2, 3, 255, 256, 257, 600])(
    "matches the proof built from all leaves at tile boundaries of a %i-leaf tree",
    async (size) => {
      const leafHashes = leafHashesFor(size);
      const readTile = await tileReaderFor(leafHashes);
      const mismatches = await Promise.all(
        boundaryIndices(size).map(async (index) => {
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

describe("building consistency proofs from tiles", () => {
  const sizePairs: readonly (readonly [number, number])[] = [
    [1, 1],
    [1, 2],
    [3, 8],
    [6, 8],
    [1, 600],
    [255, 256],
    [255, 257],
    [256, 257],
    [256, 600],
    [257, 600],
    [511, 513],
    [599, 600],
    [600, 600],
  ];

  it.each(sizePairs)(
    "matches the proof built from all leaves from size %i to size %i",
    async (oldSize, newSize) => {
      const leafHashes = leafHashesFor(newSize);
      const fromTiles = await consistencyProofFromTiles({
        oldSize: BigInt(oldSize),
        newSize: BigInt(newSize),
        readTile: await tileReaderFor(leafHashes),
      });
      expect(fromTiles).toEqual(consistencyProof({ leafHashes, oldSize: BigInt(oldSize) }));
    },
  );

  it("reaches into level-1 tiles for larger trees", async () => {
    const leafHashes = leafHashesFor(70_000);
    const fromTiles = await consistencyProofFromTiles({
      oldSize: 65_537n,
      newSize: 70_000n,
      readTile: await tileReaderFor(leafHashes),
    });
    expect(fromTiles).toEqual(consistencyProof({ leafHashes, oldSize: 65_537n }));
  }, 20_000);

  it.each([
    [0n, 3n],
    [4n, 3n],
  ])("refuses a proof from size %i to size %i", async (oldSize, newSize) => {
    await expect(
      consistencyProofFromTiles({
        oldSize,
        newSize,
        readTile: await tileReaderFor(leafHashesFor(3)),
      }),
    ).rejects.toThrow(RangeError);
  });
});
