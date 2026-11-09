import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ctIdentity, decodeTileLeaves, encodeTileLeaf, merkleTreeLeafHash } from "../src/index.js";
import { CERTIFICATE_ENTRY, PRECERTIFICATE_ENTRY } from "./fixtures.js";

const base64 = z.string().transform((text) => Uint8Array.from(Buffer.from(text, "base64")));

const Vectors = z.array(
  z.object({
    name: z.enum(["certificate", "precertificate"]),
    index: z.number().int().nonnegative().transform(BigInt),
    leafData: base64,
    leafHash: base64,
    identity: base64,
  }),
);

const vectors = Vectors.parse(
  JSON.parse(readFileSync(new URL("./vectors/ctonly.json", import.meta.url), "utf8")),
).map((vector) => ({
  ...vector,
  entry: vector.name === "certificate" ? CERTIFICATE_ENTRY : PRECERTIFICATE_ENTRY,
}));

describe("encoding static-CT entries exactly as Go ctonly does", () => {
  it.each(vectors)("encodes a $name TileLeaf at index $index", ({ entry, index, leafData }) => {
    expect(encodeTileLeaf(entry, index)).toEqual(leafData);
  });

  it.each(vectors)("hashes the $name MerkleTreeLeaf at index $index", ({ entry, index, leafHash }) => {
    expect(merkleTreeLeafHash(entry, index)).toEqual(leafHash);
  });

  it.each(vectors)("derives the $name antispam identity", ({ entry, identity }) => {
    expect(ctIdentity(entry)).toEqual(identity);
  });

  it("refuses leaf indices that do not fit in 40 bits", () => {
    expect(() => encodeTileLeaf(CERTIFICATE_ENTRY, 2n ** 40n)).toThrow(RangeError);
  });
});

describe("decoding static-CT data tiles", () => {
  it("recovers entries and their indices from concatenated TileLeaves", () => {
    const bundle = Buffer.concat([encodeTileLeaf(CERTIFICATE_ENTRY, 300n), encodeTileLeaf(PRECERTIFICATE_ENTRY, 301n)]);
    expect(decodeTileLeaves(new Uint8Array(bundle))).toEqual({
      ok: true,
      value: [
        { entry: CERTIFICATE_ENTRY, index: 300n },
        { entry: PRECERTIFICATE_ENTRY, index: 301n },
      ],
    });
  });

  it.each(vectors)("rejects a truncated $name TileLeaf", ({ leafData }) => {
    expect(decodeTileLeaves(leafData.slice(0, -1)).ok).toBe(false);
  });
});
