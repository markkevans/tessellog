import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { leafHash, rootHash, verifyConsistency, verifyInclusion } from "../src/index.js";

const VECTOR_ROOT = fileURLToPath(new URL("./vectors/merkle/", import.meta.url));

const hash = z
  .string()
  .transform((encoded) => Uint8Array.from(Buffer.from(encoded, "base64")));
const hashOrNull = z.union([hash, z.null()]).transform((h) => h ?? new Uint8Array());
const proof = z
  .union([z.array(hash), z.null()])
  .transform((hashes) => hashes ?? []);
const size = z.number().int().nonnegative().transform(BigInt);
const expectation = { desc: z.string(), wantErr: z.boolean() };

const InclusionProbe = z.object({
  leafIdx: size,
  treeSize: size,
  root: hashOrNull,
  leafHash: hashOrNull,
  proof,
  ...expectation,
});

const ConsistencyProbe = z.object({
  size1: size,
  size2: size,
  root1: hashOrNull,
  root2: hashOrNull,
  proof,
  ...expectation,
});

const loadProbes = <T>(directory: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>) =>
  readdirSync(`${VECTOR_ROOT}${directory}`, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => ({
      file,
      probe: schema.parse(
        JSON.parse(readFileSync(`${VECTOR_ROOT}${directory}/${file}`, "utf8")),
      ),
    }));

const inclusionProbes = loadProbes("inclusion", InclusionProbe);
const consistencyProbes = loadProbes("consistency", ConsistencyProbe);

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
  const rfc6962LeafHashes = (): readonly Uint8Array[] =>
    ["", "00", "10", "2021", "3031", "40414243", "5051525354555657", "606162636465666768696a6b6c6d6e6f"]
      .map((hex) => Uint8Array.from(Buffer.from(hex, "hex")))
      .map(leafHash);

  const subtreeHash = (start: number, end: number): Uint8Array =>
    rootHash(rfc6962LeafHashes().slice(start, end));

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
