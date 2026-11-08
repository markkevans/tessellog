import { describe, expect, it } from "vitest";
import { inclusionProofFromTiles, integrate, leafHash } from "../src/index.js";

const leafHashesFor = (count: number): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => leafHash(new TextEncoder().encode(`leaf ${i}`)));

const truncatedTiles = async (): Promise<Uint8Array> => new Uint8Array(31);

describe("rejecting tiles of the wrong length", () => {
  it("refuses to integrate onto a truncated partial tile", async () => {
    await expect(
      integrate({ fromSize: 1n, leafHashes: leafHashesFor(1), readTile: truncatedTiles }),
    ).rejects.toThrow("tile tile/0/000.p/1 has 31 bytes, want 32");
  });

  it("refuses to build a proof from a truncated tile", async () => {
    await expect(
      inclusionProofFromTiles({ leafIndex: 0n, treeSize: 2n, readTile: truncatedTiles }),
    ).rejects.toThrow("tile tile/0/000.p/2 has 31 bytes, want 64");
  });
});
