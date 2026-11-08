import { describe, expect, it } from "vitest";
import { tileLayout } from "../src/index.js";

describe("laying out a tree as tiles (tlog-tiles)", () => {
  it("matches the tlog-tiles example for a tree of 70,000 entries", () => {
    expect(tileLayout(70_000n)).toEqual([
      { level: 0, fullTiles: 273n, partialWidth: 112 },
      { level: 1, fullTiles: 1n, partialWidth: 17 },
      { level: 2, fullTiles: 0n, partialWidth: 1 },
    ]);
  });

  it("has no tiles for an empty tree", () => {
    expect(tileLayout(0n)).toEqual([]);
  });

  it("has only a partial level-0 tile for a small tree", () => {
    expect(tileLayout(5n)).toEqual([{ level: 0, fullTiles: 0n, partialWidth: 5 }]);
  });

  it("needs one level-1 hash once a level-0 tile is full", () => {
    expect(tileLayout(256n)).toEqual([
      { level: 0, fullTiles: 1n, partialWidth: 0 },
      { level: 1, fullTiles: 0n, partialWidth: 1 },
    ]);
  });

  it("covers a full level-1 tile with a level-2 hash", () => {
    expect(tileLayout(65_536n)).toEqual([
      { level: 0, fullTiles: 256n, partialWidth: 0 },
      { level: 1, fullTiles: 1n, partialWidth: 0 },
      { level: 2, fullTiles: 0n, partialWidth: 1 },
    ]);
  });

  it("refuses sizes outside uint64", () => {
    expect(() => tileLayout(-1n)).toThrow(RangeError);
    expect(() => tileLayout(2n ** 64n)).toThrow(RangeError);
  });
});
