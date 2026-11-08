import { equalBytes } from "@noble/curves/utils";
import { HASH_BYTES, nodeHash } from "./merkle.js";
import { failure, success, type Result } from "./result.js";

type Proof = readonly Uint8Array[];

const bitLength = (n: bigint): number => (n === 0n ? 0 : n.toString(2).length);

const onesCount = (n: bigint): number =>
  Array.from(n.toString(2)).filter((digit) => digit === "1").length;

const trailingZeros = (n: bigint): number => {
  const binary = n.toString(2);
  return binary.length - 1 - binary.lastIndexOf("1");
};

const bitAt = (n: bigint, position: number): bigint => (n >> BigInt(position)) & 1n;

const chainInner = (seed: Uint8Array, proof: Proof, index: bigint): Uint8Array =>
  proof.reduce(
    (hash, sibling, level) =>
      bitAt(index, level) === 0n ? nodeHash(hash, sibling) : nodeHash(sibling, hash),
    seed,
  );

const chainInnerRight = (seed: Uint8Array, proof: Proof, index: bigint): Uint8Array =>
  proof.reduce(
    (hash, sibling, level) => (bitAt(index, level) === 1n ? nodeHash(sibling, hash) : hash),
    seed,
  );

const chainBorderRight = (seed: Uint8Array, proof: Proof): Uint8Array =>
  proof.reduce((hash, sibling) => nodeHash(sibling, hash), seed);

const decomposeInclusionProof = (
  index: bigint,
  size: bigint,
): { readonly inner: number; readonly border: number } => {
  const inner = bitLength(index ^ (size - 1n));
  return { inner, border: onesCount(index >> BigInt(inner)) };
};

const matchRoot = (calculated: Uint8Array, expected: Uint8Array): Result<void> =>
  equalBytes(calculated, expected)
    ? success(undefined)
    : failure("calculated root does not match expected root");

export const verifyInclusion = ({
  leafIndex,
  treeSize,
  leafHash,
  proof,
  rootHash,
}: {
  readonly leafIndex: bigint;
  readonly treeSize: bigint;
  readonly leafHash: Uint8Array;
  readonly proof: Proof;
  readonly rootHash: Uint8Array;
}): Result<void> => {
  if (leafIndex >= treeSize) {
    return failure(`leaf index ${leafIndex} is beyond tree size ${treeSize}`);
  }
  if (leafHash.length !== HASH_BYTES) {
    return failure(`leaf hash must be ${HASH_BYTES} bytes`);
  }
  const { inner, border } = decomposeInclusionProof(leafIndex, treeSize);
  if (proof.length !== inner + border) {
    return failure(`inclusion proof has ${proof.length} hashes, want ${inner + border}`);
  }
  const calculated = chainBorderRight(
    chainInner(leafHash, proof.slice(0, inner), leafIndex),
    proof.slice(inner),
  );
  return matchRoot(calculated, rootHash);
};

export const verifyConsistency = ({
  oldSize,
  newSize,
  oldRoot,
  newRoot,
  proof,
}: {
  readonly oldSize: bigint;
  readonly newSize: bigint;
  readonly oldRoot: Uint8Array;
  readonly newRoot: Uint8Array;
  readonly proof: Proof;
}): Result<void> => {
  if (newSize < oldSize) {
    return failure(`new size ${newSize} is smaller than old size ${oldSize}`);
  }
  if (oldSize === 0n) {
    return failure("a consistency proof from an empty tree is meaningless");
  }
  if (oldSize === newSize) {
    return proof.length === 0
      ? matchRoot(oldRoot, newRoot)
      : failure("sizes are equal but the proof is not empty");
  }
  const decomposed = decomposeInclusionProof(oldSize - 1n, newSize);
  const shift = trailingZeros(oldSize);
  const inner = decomposed.inner - shift;
  const oldTreeIsComplete = oldSize === 1n << BigInt(shift);
  const [seed = new Uint8Array(), ...rest] = oldTreeIsComplete ? [oldRoot, ...proof] : proof;
  const expectedLength = (oldTreeIsComplete ? 0 : 1) + inner + decomposed.border;
  if (proof.length !== expectedLength) {
    return failure(`consistency proof has ${proof.length} hashes, want ${expectedLength}`);
  }
  const mask = (oldSize - 1n) >> BigInt(shift);
  const innerProof = rest.slice(0, inner);
  const borderProof = rest.slice(inner);
  const calculatedOld = chainBorderRight(chainInnerRight(seed, innerProof, mask), borderProof);
  if (!equalBytes(calculatedOld, oldRoot)) {
    return failure("calculated old root does not match expected old root");
  }
  return matchRoot(chainBorderRight(chainInner(seed, innerProof, mask), borderProof), newRoot);
};
