import { sha256 } from "@noble/hashes/sha2";
import { concatBytes } from "@noble/hashes/utils";
import { HASH_BYTES, nodeHash, rootHash } from "./merkle.js";
import { TILE_WIDTH, tileLayout, tilePath, type TileAddress } from "./tiles.js";

type Hashes = readonly Uint8Array[];

export type Tile = TileAddress & { readonly hashes: Uint8Array };

export type TileReader = (address: TileAddress) => Promise<Uint8Array>;

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

const splitHashes = (bytes: Uint8Array): Hashes =>
  Array.from({ length: bytes.length / HASH_BYTES }, (_, i) =>
    bytes.slice(i * HASH_BYTES, (i + 1) * HASH_BYTES),
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

const binaryDecomposition = (count: number): readonly number[] =>
  Array.from(count.toString(2))
    .map((bit, i, bits) => (bit === "1" ? 2 ** (bits.length - 1 - i) : 0))
    .filter((size) => size > 0);

const perfectSubtreeRoots = (partialTile: Hashes): Hashes =>
  binaryDecomposition(partialTile.length).reduce<{
    readonly offset: number;
    readonly roots: Hashes;
  }>(
    ({ offset, roots }, size) => ({
      offset: offset + size,
      roots: [...roots, rootHash(partialTile.slice(offset, offset + size))],
    }),
    { offset: 0, roots: [] },
  ).roots;

const rootFromTiles = async (size: bigint, readTile: TileReader): Promise<Uint8Array> => {
  const levels = [...tileLayout(size)].reverse();
  const partialTiles = await Promise.all(
    levels.map(({ level }) => readPartialTile(level, size / WIDTH ** BigInt(level), readTile)),
  );
  const subtreeRoots = partialTiles.flatMap(perfectSubtreeRoots);
  const last = subtreeRoots.at(-1);
  return last === undefined
    ? sha256(new Uint8Array())
    : subtreeRoots.slice(0, -1).reduceRight((root, subtree) => nodeHash(subtree, root), last);
};

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
