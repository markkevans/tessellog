import { concatBytes } from "@noble/hashes/utils";
import { rootHash } from "./merkle.js";
import { TILE_WIDTH, type TileAddress } from "./tiles.js";

type Hashes = readonly Uint8Array[];

export type Tile = TileAddress & { readonly hashes: Uint8Array };

export type TileReader = (address: TileAddress) => Promise<Uint8Array>;

export type Integration = {
  readonly size: bigint;
  readonly rootHash: Uint8Array;
  readonly tiles: readonly Tile[];
};

const chunk = (hashes: Hashes): readonly Hashes[] =>
  Array.from({ length: Math.ceil(hashes.length / TILE_WIDTH) }, (_, i) =>
    hashes.slice(i * TILE_WIDTH, (i + 1) * TILE_WIDTH),
  );

const tilesFrom = (hashes: Hashes, level: number): readonly Tile[] => {
  if (hashes.length === 0) {
    return [];
  }
  const groups = chunk(hashes);
  const tiles = groups.map((group, i) => ({
    level,
    index: BigInt(i),
    width: group.length,
    hashes: concatBytes(...group),
  }));
  const fullTileRoots = groups.filter((group) => group.length === TILE_WIDTH).map(rootHash);
  return [...tiles, ...tilesFrom(fullTileRoots, level + 1)];
};

export const integrate = async ({
  leafHashes,
}: {
  readonly fromSize: bigint;
  readonly leafHashes: Hashes;
  readonly readTile: TileReader;
}): Promise<Integration> => ({
  size: BigInt(leafHashes.length),
  rootHash: rootHash(leafHashes),
  tiles: tilesFrom(leafHashes, 0),
});
