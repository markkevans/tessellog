import { sha256 } from "@noble/hashes/sha2";
import { concatBytes } from "@noble/hashes/utils";

export const HASH_BYTES = 32;

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

export const leafHash = (entry: Uint8Array): Uint8Array =>
  sha256(concatBytes(Uint8Array.of(LEAF_PREFIX), entry));

export const nodeHash = (left: Uint8Array, right: Uint8Array): Uint8Array =>
  sha256(concatBytes(Uint8Array.of(NODE_PREFIX), left, right));

const largestPowerOfTwoBelow = (n: number): number =>
  2 ** Math.floor(Math.log2(n - 1));

export const rootHash = (leafHashes: readonly Uint8Array[]): Uint8Array => {
  const [first] = leafHashes;
  if (first === undefined) {
    return sha256(new Uint8Array());
  }
  if (leafHashes.length === 1) {
    return first;
  }
  const split = largestPowerOfTwoBelow(leafHashes.length);
  return nodeHash(
    rootHash(leafHashes.slice(0, split)),
    rootHash(leafHashes.slice(split)),
  );
};
