import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { leafHash, rootHash, toHex } from "../src/index.js";
import { rfc6962Leaves } from "./fixtures/rfc6962.js";

const rootOfFirst = (n: number): string =>
  toHex(rootHash(rfc6962Leaves().slice(0, n).map(leafHash)));

describe("RFC 6962 hashing", () => {
  it("hashes the empty leaf with a 0x00 domain-separation prefix", () => {
    expect(toHex(leafHash(new Uint8Array()))).toBe(
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    );
  });

  it("gives the empty tree the hash of the empty string", () => {
    expect(rootOfFirst(0)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("uses the leaf hash as the root of a single-entry tree", () => {
    expect(rootOfFirst(1)).toBe(
      "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    );
  });

  it("combines two leaves with a 0x01 node prefix", () => {
    expect(rootOfFirst(2)).toBe(
      "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
    );
  });

  it("splits unbalanced trees at the largest power of two", () => {
    expect(rootOfFirst(3)).toBe(
      "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
    );
    expect(rootOfFirst(7)).toBe(
      "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
    );
  });

  it("matches the RFC 6962 reference root for eight leaves", () => {
    expect(rootOfFirst(8)).toBe(
      "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
    );
  });

  it("hashes entries as large as the static-CT limit of 256 KiB", () => {
    const entry = new Uint8Array(256 * 1024).fill(0x5a);
    const independentlyComputed = createHash("sha256")
      .update(Uint8Array.of(0x00))
      .update(entry)
      .digest("hex");
    expect(toHex(leafHash(entry))).toBe(independentlyComputed);
  });
});
