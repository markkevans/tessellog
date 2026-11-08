import { concatBytes } from "@noble/hashes/utils";
import { describe, expect, it } from "vitest";
import {
  integrate,
  leafHash,
  rootHash,
  tilePath,
  toHex,
  type Tile,
  type TileAddress,
} from "../src/index.js";

const leafHashesFor = (count: number): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => leafHash(new TextEncoder().encode(`leaf ${i}`)));

const noExistingTiles = async (address: TileAddress): Promise<Uint8Array> => {
  throw new Error(`unexpected read of tile ${address.level}/${address.index}`);
};

const integrateIntoEmptyTree = (leafHashes: readonly Uint8Array[]) =>
  integrate({ fromSize: 0n, leafHashes, readTile: noExistingTiles });

describe("integrating leaves into an empty tree", () => {
  it.each([0, 1, 2, 3, 127, 255, 256, 257, 511, 512, 513, 600])(
    "has the RFC 6962 root for a tree of %i leaves",
    async (size) => {
      const leafHashes = leafHashesFor(size);
      const result = await integrateIntoEmptyTree(leafHashes);
      expect(toHex(result.rootHash)).toBe(toHex(rootHash(leafHashes)));
    },
  );

  it("reports the new tree size", async () => {
    expect((await integrateIntoEmptyTree(leafHashesFor(600))).size).toBe(600n);
  });

  it("writes no tiles for an empty tree", async () => {
    expect((await integrateIntoEmptyTree([])).tiles).toEqual([]);
  });

  it("stores leaf hashes in level-0 tiles and full-tile roots in level 1", async () => {
    const leafHashes = leafHashesFor(600);
    const { tiles } = await integrateIntoEmptyTree(leafHashes);
    expect(tiles).toEqual([
      { level: 0, index: 0n, width: 256, hashes: concatBytes(...leafHashes.slice(0, 256)) },
      { level: 0, index: 1n, width: 256, hashes: concatBytes(...leafHashes.slice(256, 512)) },
      { level: 0, index: 2n, width: 88, hashes: concatBytes(...leafHashes.slice(512)) },
      {
        level: 1,
        index: 0n,
        width: 2,
        hashes: concatBytes(
          rootHash(leafHashes.slice(0, 256)),
          rootHash(leafHashes.slice(256, 512)),
        ),
      },
    ]);
  });

  it("reaches level 2 and the RFC 6962 root for the tlog-tiles example size", async () => {
    const leafHashes = leafHashesFor(70_000);
    const result = await integrateIntoEmptyTree(leafHashes);
    expect(toHex(result.rootHash)).toBe(toHex(rootHash(leafHashes)));
    expect(result.tiles.find(({ level }) => level === 2)).toEqual({
      level: 2,
      index: 0n,
      width: 1,
      hashes: rootHash(leafHashes.slice(0, 65_536)),
    });
  });
});

type TileStore = ReadonlyMap<string, Uint8Array>;

const storeTiles = (store: TileStore, tiles: readonly Tile[]): TileStore =>
  new Map([...store, ...tiles.map((tile) => [tilePath(tile), tile.hashes] as const)]);

const readFrom =
  (store: TileStore) =>
  async (address: TileAddress): Promise<Uint8Array> => {
    const hashes = store.get(tilePath(address));
    if (hashes === undefined) {
      throw new Error(`missing tile ${tilePath(address)}`);
    }
    return hashes;
  };

type Batched = { readonly store: TileStore; readonly size: bigint; readonly rootHash: Uint8Array };

const integrateInBatches = (
  leafHashes: readonly Uint8Array[],
  batchSizes: readonly number[],
): Promise<Batched> =>
  batchSizes.reduce<Promise<Batched>>(
    async (pending, batchSize) => {
      const { store, size } = await pending;
      const start = Number(size);
      const result = await integrate({
        fromSize: size,
        leafHashes: leafHashes.slice(start, start + batchSize),
        readTile: readFrom(store),
      });
      return { store: storeTiles(store, result.tiles), size: result.size, rootHash: result.rootHash };
    },
    Promise.resolve({ store: new Map(), size: 0n, rootHash: new Uint8Array() }),
  );

describe("integrating leaves in batches", () => {
  const TOTAL = 1000;

  it.each<[string, readonly number[]]>([
    ["one batch", [TOTAL]],
    ["tile-aligned batches", [256, 256, 256, 232]],
    ["batches straddling tile boundaries", [255, 1, 1, 743]],
    ["batches of 100", Array.from({ length: 10 }, () => 100)],
    ["single leaves then the rest", [...Array.from({ length: 300 }, () => 1), 700]],
  ])("gives the same tiles and root using %s", async (_, batchSizes) => {
    const leafHashes = leafHashesFor(TOTAL);
    const allAtOnce = await integrateIntoEmptyTree(leafHashes);
    const batched = await integrateInBatches(leafHashes, batchSizes);
    expect(batched.size).toBe(BigInt(TOTAL));
    expect(toHex(batched.rootHash)).toBe(toHex(allAtOnce.rootHash));
    expect(
      allAtOnce.tiles.filter((tile) => {
        const stored = batched.store.get(tilePath(tile));
        return stored === undefined || toHex(stored) !== toHex(tile.hashes);
      }),
    ).toEqual([]);
  });

  it("returns only the tiles that changed", async () => {
    const leafHashes = leafHashesFor(601);
    const { store } = await integrateInBatches(leafHashes, [600]);
    const { tiles } = await integrate({
      fromSize: 600n,
      leafHashes: leafHashes.slice(600),
      readTile: readFrom(store),
    });
    expect(tiles).toEqual([
      { level: 0, index: 2n, width: 89, hashes: concatBytes(...leafHashes.slice(512, 601)) },
    ]);
  });
});
