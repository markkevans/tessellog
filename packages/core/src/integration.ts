import { concatBytes } from "@noble/hashes/utils";
import { rootHash } from "./merkle.js";
import { splitHashes, subtreeHasher, type Hashes, type TileReader } from "./tile-hashes.js";
import { TILE_WIDTH, tilePath, type TileAddress } from "./tiles.js";

export type Tile = TileAddress & { readonly hashes: Uint8Array };

export type { TileReader } from "./tile-hashes.js";

export type Integration = {
  readonly size: bigint;
  readonly rootHash: Uint8Array;
  readonly tiles: readonly Tile[];
};

const WIDTH = BigInt(TILE_WIDTH);

const chunk = (hashes: Hashes, size: number): readonly Hashes[] =>
  Array.from({ length: Math.ceil(hashes.length / size) }, (_, i) =>
    hashes.slice(i * size, (i + 1) * size),
  );

const readPartialTile = async (
  level: number,
  hashesAtLevel: bigint,
  readTile: TileReader,
): Promise<Hashes> => {
  const width = Number(hashesAtLevel % WIDTH);
  return width === 0
    ? []
    : splitHashes(await readTile({ level, index: hashesAtLevel / WIDTH, width }));
};

const extendLevel = async (
  level: number,
  existingHashesAtLevel: bigint,
  newHashes: Hashes,
  readTile: TileReader,
): Promise<readonly Tile[]> => {
  if (newHashes.length === 0) {
    return [];
  }
  const firstTile = existingHashesAtLevel / WIDTH;
  const existing = await readPartialTile(level, existingHashesAtLevel, readTile);
  const groups = chunk([...existing, ...newHashes], TILE_WIDTH);
  const tiles = groups.map((group, i) => ({
    level,
    index: firstTile + BigInt(i),
    width: group.length,
    hashes: concatBytes(...group),
  }));
  const completedTileRoots = groups
    .filter((group) => group.length === TILE_WIDTH)
    .map(rootHash);
  return [
    ...tiles,
    ...(await extendLevel(level + 1, firstTile, completedTileRoots, readTile)),
  ];
};

const rootFromTiles = (size: bigint, readTile: TileReader): Promise<Uint8Array> =>
  size === 0n ? Promise.resolve(rootHash([])) : subtreeHasher(size, readTile)(0n, size);

const preferringWritten =
  (written: readonly Tile[], readTile: TileReader): TileReader =>
  async (address) =>
    written.find((tile) => tilePath(tile) === tilePath(address))?.hashes ?? readTile(address);

export const integrate = async ({
  fromSize,
  leafHashes,
  readTile,
}: {
  readonly fromSize: bigint;
  readonly leafHashes: Hashes;
  readonly readTile: TileReader;
}): Promise<Integration> => {
  const size = fromSize + BigInt(leafHashes.length);
  const tiles = await extendLevel(0, fromSize, leafHashes, readTile);
  return {
    size,
    rootHash: await rootFromTiles(size, preferringWritten(tiles, readTile)),
    tiles,
  };
};
