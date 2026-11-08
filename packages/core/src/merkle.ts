import { sha256 } from "@noble/hashes/sha2";
import { concatBytes } from "@noble/hashes/utils";
import { largestPowerOfTwoBelow } from "./bits.js";

export const HASH_BYTES = 32;

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

export const leafHash = (entry: Uint8Array): Uint8Array =>
  sha256(concatBytes(Uint8Array.of(LEAF_PREFIX), entry));

export const nodeHash = (left: Uint8Array, right: Uint8Array): Uint8Array =>
  sha256(concatBytes(Uint8Array.of(NODE_PREFIX), left, right));

type Hashes = readonly Uint8Array[];

export type TreeSplit = {
  readonly split: number;
  readonly left: Hashes;
  readonly right: Hashes;
};

export const splitTree = (leafHashes: Hashes): TreeSplit => {
  const split = Number(largestPowerOfTwoBelow(BigInt(leafHashes.length)));
  return { split, left: leafHashes.slice(0, split), right: leafHashes.slice(split) };
};

export const rootHash = (leafHashes: Hashes): Uint8Array => {
  const [first] = leafHashes;
  if (first === undefined) {
    return sha256(new Uint8Array());
  }
  if (leafHashes.length === 1) {
    return first;
  }
  const { left, right } = splitTree(leafHashes);
  return nodeHash(rootHash(left), rootHash(right));
};
