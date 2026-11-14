import { bitLength, isPowerOfTwo, largestPowerOfTwoBelow } from "./bits.js";
import { HASH_BYTES, nodeHash, rootHash } from "./merkle.js";
import { TILE_WIDTH, TILE_WIDTH_BIGINT as WIDTH, tilePath, type TileAddress } from "./tiles.js";

export type Hashes = readonly Uint8Array[];

export type TileReader = (address: TileAddress) => Promise<Uint8Array>;

export type SubtreeHasher = (start: bigint, end: bigint) => Promise<Uint8Array>;

const BITS_PER_LEVEL = 8;

const readTileBytes = async (readTile: TileReader, address: TileAddress): Promise<Uint8Array> => {
  const bytes = await readTile(address);
  const expected = address.width * HASH_BYTES;
  if (bytes.length !== expected) {
    throw new Error(`tile ${tilePath(address)} has ${bytes.length} bytes, want ${expected}`);
  }
  return bytes;
};

const hashesIn = (bytes: Uint8Array, offset: number, count: number): Hashes =>
  Array.from({ length: count }, (_, i) => bytes.slice((offset + i) * HASH_BYTES, (offset + i + 1) * HASH_BYTES));

export const readTileHashes = async (readTile: TileReader, address: TileAddress): Promise<Hashes> =>
  hashesIn(await readTileBytes(readTile, address), 0, address.width);

const tileWidth = (treeSize: bigint, level: number, index: bigint): number => {
  const hashesAtLevel = treeSize >> BigInt(BITS_PER_LEVEL * level);
  return index < hashesAtLevel / WIDTH ? TILE_WIDTH : Number(hashesAtLevel % WIDTH);
};

export const subtreeHasher = (treeSize: bigint, readTile: TileReader): SubtreeHasher => {
  const perfectSubtree = async (start: bigint, size: bigint): Promise<Uint8Array> => {
    const height = bitLength(size) - 1;
    const level = Math.floor(height / BITS_PER_LEVEL);
    const count = 2 ** (height % BITS_PER_LEVEL);
    const position = start >> BigInt(BITS_PER_LEVEL * level);
    const index = position / WIDTH;
    const offset = Number(position % WIDTH);
    const tile = await readTileBytes(readTile, {
      level,
      index,
      width: tileWidth(treeSize, level, index),
    });
    return rootHash(hashesIn(tile, offset, count));
  };
  const rangeHash: SubtreeHasher = async (start, end) => {
    const size = end - start;
    if (isPowerOfTwo(size)) {
      return perfectSubtree(start, size);
    }
    const middle = start + largestPowerOfTwoBelow(size);
    return nodeHash(await rangeHash(start, middle), await rangeHash(middle, end));
  };
  return rangeHash;
};
