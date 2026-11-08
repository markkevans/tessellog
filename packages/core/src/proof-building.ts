import { rootHash, splitTree } from "./merkle.js";

type Hashes = readonly Uint8Array[];

const path = (index: number, leafHashes: Hashes): Hashes => {
  if (leafHashes.length <= 1) {
    return [];
  }
  const { split, left, right } = splitTree(leafHashes);
  return index < split
    ? [...path(index, left), rootHash(right)]
    : [...path(index - split, right), rootHash(left)];
};

const subproof = (oldSize: number, leafHashes: Hashes, isWholeOldTree: boolean): Hashes => {
  if (oldSize === leafHashes.length) {
    return isWholeOldTree ? [] : [rootHash(leafHashes)];
  }
  const { split, left, right } = splitTree(leafHashes);
  return oldSize <= split
    ? [...subproof(oldSize, left, isWholeOldTree), rootHash(right)]
    : [...subproof(oldSize - split, right, false), rootHash(left)];
};

export const inclusionProof = ({
  leafHashes,
  leafIndex,
}: {
  readonly leafHashes: Hashes;
  readonly leafIndex: bigint;
}): Hashes => {
  if (leafIndex < 0n || leafIndex >= BigInt(leafHashes.length)) {
    throw new RangeError(`leaf index ${leafIndex} is outside a tree of ${leafHashes.length}`);
  }
  return path(Number(leafIndex), leafHashes);
};

export const consistencyProof = ({
  leafHashes,
  oldSize,
}: {
  readonly leafHashes: Hashes;
  readonly oldSize: bigint;
}): Hashes => {
  if (oldSize < 1n || oldSize > BigInt(leafHashes.length)) {
    throw new RangeError(
      `old size ${oldSize} must be between 1 and the current size ${leafHashes.length}`,
    );
  }
  return subproof(Number(oldSize), leafHashes, true);
};
