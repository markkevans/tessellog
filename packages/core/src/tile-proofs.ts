import { HASH_BYTES, nodeHash, rootHash } from "./merkle.js";
import { TILE_WIDTH } from "./tiles.js";
import type { TileReader } from "./integration.js";

type Hashes = readonly Uint8Array[];

const WIDTH = BigInt(TILE_WIDTH);
const BITS_PER_LEVEL = 8;

const bitLength = (n: bigint): number => n.toString(2).length;

const isPowerOfTwo = (n: bigint): boolean => (n & (n - 1n)) === 0n;

const largestPowerOfTwoBelow = (n: bigint): bigint => 1n << BigInt(bitLength(n - 1n) - 1);

const splitHashes = (bytes: Uint8Array): Hashes =>
  Array.from({ length: bytes.length / HASH_BYTES }, (_, i) =>
    bytes.slice(i * HASH_BYTES, (i + 1) * HASH_BYTES),
  );

type SubtreeHasher = (start: bigint, end: bigint) => Promise<Uint8Array>;

const tileWidth = (treeSize: bigint, level: number, index: bigint): number => {
  const hashesAtLevel = treeSize >> BigInt(BITS_PER_LEVEL * level);
  return index < hashesAtLevel / WIDTH ? TILE_WIDTH : Number(hashesAtLevel % WIDTH);
};

const subtreeHasher = (treeSize: bigint, readTile: TileReader): SubtreeHasher => {
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

const path = async (
  index: bigint,
  start: bigint,
  end: bigint,
  hash: SubtreeHasher,
): Promise<Hashes> => {
  if (end - start <= 1n) {
    return [];
  }
  const middle = start + largestPowerOfTwoBelow(end - start);
  return index < middle
    ? [...(await path(index, start, middle, hash)), await hash(middle, end)]
    : [...(await path(index, middle, end, hash)), await hash(start, middle)];
};

export const inclusionProofFromTiles = async ({
  leafIndex,
  treeSize,
  readTile,
}: {
  readonly leafIndex: bigint;
  readonly treeSize: bigint;
  readonly readTile: TileReader;
}): Promise<Hashes> => {
  if (leafIndex >= treeSize) {
    throw new RangeError(`leaf index ${leafIndex} is outside a tree of ${treeSize}`);
  }
  return path(leafIndex, 0n, treeSize, subtreeHasher(treeSize, readTile));
};
