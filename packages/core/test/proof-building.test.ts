import { equalBytes } from "@noble/curves/utils";
import { describe, expect, it } from "vitest";
import {
  consistencyProof,
  inclusionProof,
  leafHash,
  rootHash,
  verifyConsistency,
  verifyInclusion,
} from "../src/index.js";
import { consistencyProbes, inclusionProbes } from "./fixtures/merkle-vectors.js";
import { rfc6962LeafHashes, rfc6962SubtreeHash } from "./fixtures/rfc6962.js";

const MAX_TREE_SIZE = 40;

const syntheticLeafHashes = (size: number): readonly Uint8Array[] =>
  Array.from({ length: size }, (_, i) => leafHash(new TextEncoder().encode(`entry ${i}`)));

const sizesUpTo = (max: number): readonly number[] =>
  Array.from({ length: max }, (_, i) => i + 1);

const isRfc6962Root = (size: bigint, root: Uint8Array): boolean =>
  size <= 8n && equalBytes(root, rfc6962SubtreeHash(0, Number(size)));

describe("building proofs that match the reference implementation", () => {
  const rfcInclusion = inclusionProbes
    .map(({ probe }) => probe)
    .filter((probe) => !probe.wantErr && isRfc6962Root(probe.treeSize, probe.root));

  const rfcConsistency = consistencyProbes
    .map(({ probe }) => probe)
    .filter((probe) => !probe.wantErr && isRfc6962Root(probe.size2, probe.root2));

  it("finds the upstream probes built over the RFC 6962 tree", () => {
    expect(rfcInclusion).toHaveLength(5);
    expect(rfcConsistency).toHaveLength(5);
  });

  it.each(rfcInclusion)("builds the reference inclusion proof: $desc", (probe) => {
    expect(
      inclusionProof({
        leafHashes: rfc6962LeafHashes().slice(0, Number(probe.treeSize)),
        leafIndex: probe.leafIdx,
      }),
    ).toEqual(probe.proof);
  });

  it.each(rfcConsistency)("builds the reference consistency proof: $desc", (probe) => {
    expect(
      consistencyProof({
        leafHashes: rfc6962LeafHashes().slice(0, Number(probe.size2)),
        oldSize: probe.size1,
      }),
    ).toEqual(probe.proof);
  });
});

describe("building proofs that verify", () => {
  it.each(sizesUpTo(MAX_TREE_SIZE))(
    "proves every leaf is included in a tree of size %i",
    (size) => {
      const leafHashes = syntheticLeafHashes(size);
      const failures = leafHashes
        .map((hash, index) =>
          verifyInclusion({
            leafIndex: BigInt(index),
            treeSize: BigInt(size),
            leafHash: hash,
            proof: inclusionProof({ leafHashes, leafIndex: BigInt(index) }),
            rootHash: rootHash(leafHashes),
          }),
        )
        .filter((result) => !result.ok);
      expect(failures).toEqual([]);
    },
  );

  it.each(sizesUpTo(MAX_TREE_SIZE))(
    "proves every smaller tree is a prefix of a tree of size %i",
    (size) => {
      const leafHashes = syntheticLeafHashes(size);
      const failures = sizesUpTo(size)
        .map((oldSize) =>
          verifyConsistency({
            oldSize: BigInt(oldSize),
            newSize: BigInt(size),
            oldRoot: rootHash(leafHashes.slice(0, oldSize)),
            newRoot: rootHash(leafHashes),
            proof: consistencyProof({ leafHashes, oldSize: BigInt(oldSize) }),
          }),
        )
        .filter((result) => !result.ok);
      expect(failures).toEqual([]);
    },
  );
});

describe("refusing proofs that cannot exist", () => {
  it("refuses an inclusion proof for a leaf beyond the tree", () => {
    expect(() =>
      inclusionProof({ leafHashes: syntheticLeafHashes(3), leafIndex: 3n }),
    ).toThrow(RangeError);
  });

  it("refuses a consistency proof from an empty tree", () => {
    expect(() =>
      consistencyProof({ leafHashes: syntheticLeafHashes(3), oldSize: 0n }),
    ).toThrow(RangeError);
  });

  it("refuses a consistency proof from a tree larger than the current one", () => {
    expect(() =>
      consistencyProof({ leafHashes: syntheticLeafHashes(3), oldSize: 4n }),
    ).toThrow(RangeError);
  });
});
