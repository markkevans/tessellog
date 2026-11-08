import { concatBytes } from "@noble/hashes/utils";
import { describe, expect, it } from "vitest";
import { integrate, leafHash, rootHash, toHex, type TileAddress } from "../src/index.js";

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
