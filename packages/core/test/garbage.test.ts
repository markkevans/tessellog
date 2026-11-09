import { describe, expect, it } from "vitest";
import { partialBundlesPrefix, partialTilesPrefix, tilesFilledBetween } from "../src/index.js";

describe("finding tiles that became full as a tree grew", () => {
  it.each<[string, bigint, bigint, readonly { level: number; index: bigint }[]]>([
    ["no tile fills before 256 leaves", 0n, 255n, []],
    ["the first level-0 tile fills at 256", 0n, 256n, [{ level: 0, index: 0n }]],
    ["several level-0 tiles fill across a range", 255n, 513n, [{ level: 0, index: 0n }, { level: 0, index: 1n }]],
    ["an already-full tile is not listed again", 256n, 511n, []],
    [
      "the first level-1 tile fills at 65,536",
      65_535n,
      65_536n,
      [
        { level: 0, index: 255n },
        { level: 1, index: 0n },
      ],
    ],
    ["nothing fills when the size is unchanged", 70_000n, 70_000n, []],
  ])("%s", (_, fromSize, toSize, filled) => {
    expect(tilesFilledBetween({ fromSize, toSize })).toEqual(filled);
  });

  it("refuses a tree that shrank", () => {
    expect(() => tilesFilledBetween({ fromSize: 5n, toSize: 4n })).toThrow(RangeError);
  });
});

describe("addressing the partial versions of a tile", () => {
  it("names the directory holding a tile's partial widths", () => {
    expect(partialTilesPrefix({ level: 0, index: 1_234_067n })).toBe("tile/0/x001/x234/067.p/");
  });

  it("names the directory holding a bundle's partial widths", () => {
    expect(partialBundlesPrefix({ index: 0n })).toBe("tile/entries/000.p/");
  });
});
