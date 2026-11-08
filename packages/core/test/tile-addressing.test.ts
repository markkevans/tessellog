import { describe, expect, it } from "vitest";
import { tilePath } from "../src/index.js";

describe("addressing hash tiles (tlog-tiles)", () => {
  it("writes the level and a zero-padded three-digit index", () => {
    expect(tilePath({ level: 0, index: 0n })).toBe("tile/0/000");
    expect(tilePath({ level: 1, index: 5n })).toBe("tile/1/005");
  });

  it("splits large indices into x-prefixed groups of three digits", () => {
    expect(tilePath({ level: 0, index: 1000n })).toBe("tile/0/x001/000");
    expect(tilePath({ level: 2, index: 1_234_067n })).toBe(
      "tile/2/x001/x234/067",
    );
  });

  it("supports the full uint64 index range", () => {
    expect(tilePath({ level: 0, index: 2n ** 64n - 1n })).toBe(
      "tile/0/x018/x446/x744/x073/x709/x551/615",
    );
  });
});
