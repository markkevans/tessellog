import { describe, expect, it } from "vitest";
import {
  consistencyProof,
  consistencyProofFromTiles,
  inclusionProof,
  inclusionProofFromTiles,
  integrate,
  leafHash,
  rootFromTilesAndLeaves,
  rootHash,
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

describe("computing a tree's root from tiles and a run of known leaves", () => {
  const bundleRuns = (size: number): readonly (readonly [number, number])[] =>
    Array.from({ length: Math.ceil(size / 256) }, (_, bundle) => [bundle * 256, Math.min(size, bundle * 256 + 256)]);

  it.each([1, 2, 3, 255, 256, 257, 512, 513, 600])(
    "matches the root of all leaves for every bundle of a %i-leaf tree",
    async (size) => {
      const leafHashes = leafHashesFor(size);
      const readTile = await tileReaderFor(leafHashes);
      const roots = await Promise.all(
        bundleRuns(size).map(([start, end]) =>
          rootFromTilesAndLeaves({
            treeSize: BigInt(size),
            start: BigInt(start),
            leafHashes: leafHashes.slice(start, end),
            readTile,
          }),
        ),
      );
      expect(roots).toEqual(bundleRuns(size).map(() => rootHash(leafHashes)));
    },
  );

  it("matches the root of all leaves for runs that do not align with tiles", async () => {
    const leafHashes = leafHashesFor(600);
    const readTile = await tileReaderFor(leafHashes);
    const runs = [[0, 1], [5, 6], [100, 300], [255, 257], [599, 600], [0, 600]] as const;
    const roots = await Promise.all(
      runs.map(([start, end]) =>
        rootFromTilesAndLeaves({ treeSize: 600n, start: BigInt(start), leafHashes: leafHashes.slice(start, end), readTile }),
      ),
    );
    expect(roots).toEqual(runs.map(() => rootHash(leafHashes)));
  });

  it("gives a different root when any known leaf differs", async () => {
    const leafHashes = leafHashesFor(513);
    const readTile = await tileReaderFor(leafHashes);
    const forged = leafHash(new TextEncoder().encode("forged"));
    const roots = await Promise.all(
      [256, 300, 511].map((replaced) =>
        rootFromTilesAndLeaves({
          treeSize: 513n,
          start: 256n,
          leafHashes: leafHashes.slice(256, 512).map((hash, i) => (256 + i === replaced ? forged : hash)),
          readTile,
        }),
      ),
    );
    expect(roots.filter((root) => Buffer.from(root).equals(Buffer.from(rootHash(leafHashes))))).toEqual([]);
  });

  it("reads no tiles when the known leaves are the whole tree", async () => {
    const leafHashes = leafHashesFor(300);
    const root = await rootFromTilesAndLeaves({
      treeSize: 300n,
      start: 0n,
      leafHashes,
      readTile: async (address) => {
        throw new Error(`unexpected read of ${tilePath(address)}`);
      },
    });
    expect(root).toEqual(rootHash(leafHashes));
  });

  it.each([
    ["no leaves", 0n, 0],
    ["leaves beyond the tree", 2n, 2],
  ])("refuses %s", async (_, start, count) => {
    const leafHashes = leafHashesFor(3);
    await expect(
      rootFromTilesAndLeaves({ treeSize: 3n, start, leafHashes: leafHashes.slice(0, count), readTile: await tileReaderFor(leafHashes) }),
    ).rejects.toThrow(RangeError);
  });
});
