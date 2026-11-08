import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { verifyConsistency, verifyInclusion } from "../src/index.js";

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
