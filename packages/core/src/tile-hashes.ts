import { bitLength, isPowerOfTwo, largestPowerOfTwoBelow } from "./bits.js";
import { HASH_BYTES, nodeHash, rootHash } from "./merkle.js";
import { TILE_WIDTH, type TileAddress } from "./tiles.js";

export type Hashes = readonly Uint8Array[];

export type TileReader = (address: TileAddress) => Promise<Uint8Array>;

export type SubtreeHasher = (start: bigint, end: bigint) => Promise<Uint8Array>;

const WIDTH = BigInt(TILE_WIDTH);
const BITS_PER_LEVEL = 8;

export const splitHashes = (bytes: Uint8Array): Hashes =>
  Array.from({ length: bytes.length / HASH_BYTES }, (_, i) =>
    bytes.slice(i * HASH_BYTES, (i + 1) * HASH_BYTES),
  );

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
    const tile = splitHashes(
      await readTile({ level, index, width: tileWidth(treeSize, level, index) }),
    );
    return rootHash(tile.slice(offset, offset + count));
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
