import { describe, expect, it } from "vitest";
import { verifyConsistency, verifyInclusion } from "../src/index.js";
import { consistencyProbes, inclusionProbes } from "./fixtures/merkle-vectors.js";
import { rfc6962SubtreeHash as subtreeHash } from "./fixtures/rfc6962.js";

describe("verifying inclusion proofs (transparency-dev/merkle vectors)", () => {
  it("loads the full vector suite", () => {
    expect(inclusionProbes).toHaveLength(98);
  });

  it.each(inclusionProbes)("$file", ({ probe }) => {
    const result = verifyInclusion({
      leafIndex: probe.leafIdx,
      treeSize: probe.treeSize,
      leafHash: probe.leafHash,
      proof: probe.proof,
      rootHash: probe.root,
    });
    expect({ desc: probe.desc, verified: result.ok }).toEqual({
      desc: probe.desc,
      verified: !probe.wantErr,
    });
  });
});

describe("verifying consistency proofs (transparency-dev/merkle vectors)", () => {
  it("loads the full vector suite", () => {
    expect(consistencyProbes).toHaveLength(98);
  });

  it.each(consistencyProbes)("$file", ({ probe }) => {
    const result = verifyConsistency({
      oldSize: probe.size1,
      newSize: probe.size2,
      oldRoot: probe.root1,
      newRoot: probe.root2,
      proof: probe.proof,
    });
    expect({ desc: probe.desc, verified: result.ok }).toEqual({
      desc: probe.desc,
      verified: !probe.wantErr,
    });
  });
});

describe("verifying consistency between trees of non-power-of-two size", () => {
  const proofFromSixToEight = (): readonly Uint8Array[] => [
    subtreeHash(4, 6),
    subtreeHash(6, 8),
    subtreeHash(0, 4),
  ];

  it("accepts the RFC 6962 proof that a 6-leaf tree is a prefix of an 8-leaf tree", () => {
    expect(
      verifyConsistency({
        oldSize: 6n,
        newSize: 8n,
        oldRoot: subtreeHash(0, 6),
        newRoot: subtreeHash(0, 8),
        proof: proofFromSixToEight(),
      }).ok,
    ).toBe(true);
  });

  it("accepts the RFC 6962 example proof that a 3-leaf tree is a prefix of an 8-leaf tree", () => {
    expect(
      verifyConsistency({
        oldSize: 3n,
        newSize: 8n,
        oldRoot: subtreeHash(0, 3),
        newRoot: subtreeHash(0, 8),
        proof: [subtreeHash(2, 3), subtreeHash(3, 4), subtreeHash(0, 2), subtreeHash(4, 8)],
      }).ok,
    ).toBe(true);
  });

  it("rejects that proof when the old root is not the 6-leaf root", () => {
    expect(
      verifyConsistency({
        oldSize: 6n,
        newSize: 8n,
        oldRoot: subtreeHash(0, 5),
        newRoot: subtreeHash(0, 8),
        proof: proofFromSixToEight(),
      }),
    ).toEqual({ ok: false, error: "calculated old root does not match expected old root" });
  });
});
