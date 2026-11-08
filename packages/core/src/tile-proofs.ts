import { largestPowerOfTwoBelow } from "./bits.js";
import { subtreeHasher, type Hashes, type SubtreeHasher, type TileReader } from "./tile-hashes.js";

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

const subproof = async (
  oldEnd: bigint,
  start: bigint,
  end: bigint,
  isWholeOldTree: boolean,
  hash: SubtreeHasher,
): Promise<Hashes> => {
  if (oldEnd === end) {
    return isWholeOldTree ? [] : [await hash(start, end)];
  }
  const middle = start + largestPowerOfTwoBelow(end - start);
  return oldEnd <= middle
    ? [...(await subproof(oldEnd, start, middle, isWholeOldTree, hash)), await hash(middle, end)]
    : [...(await subproof(oldEnd, middle, end, false, hash)), await hash(start, middle)];
};

export const consistencyProofFromTiles = async ({
  oldSize,
  newSize,
  readTile,
}: {
  readonly oldSize: bigint;
  readonly newSize: bigint;
  readonly readTile: TileReader;
}): Promise<Hashes> => {
  if (oldSize < 1n || oldSize > newSize) {
    throw new RangeError(`old size ${oldSize} must be between 1 and the new size ${newSize}`);
  }
  return subproof(oldSize, 0n, newSize, true, subtreeHasher(newSize, readTile));
};
