import { describe, expect, it } from "vitest";
import { entriesPath, tilePath } from "../src/index.js";

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

  it("marks partial tiles with their width", () => {
    expect(tilePath({ level: 0, index: 273n, width: 112 })).toBe(
      "tile/0/273.p/112",
    );
  });

  it("omits the partial suffix for a full-width tile", () => {
    expect(tilePath({ level: 0, index: 7n, width: 256 })).toBe("tile/0/007");
  });
});

describe("addressing entry bundles (tlog-tiles)", () => {
  it("uses the same index encoding under tile/entries", () => {
    expect(entriesPath({ index: 1_234_067n })).toBe(
      "tile/entries/x001/x234/067",
    );
  });

  it("marks partial bundles with their width", () => {
    expect(entriesPath({ index: 0n, width: 1 })).toBe("tile/entries/000.p/1");
  });
});

describe("rejecting addresses outside the tlog-tiles spec", () => {
  it("rejects levels above 63", () => {
    expect(() => tilePath({ level: 64, index: 0n })).toThrow(RangeError);
  });

  it("rejects negative or fractional levels", () => {
    expect(() => tilePath({ level: -1, index: 0n })).toThrow(RangeError);
    expect(() => tilePath({ level: 1.5, index: 0n })).toThrow(RangeError);
  });

  it("rejects negative indices", () => {
    expect(() => entriesPath({ index: -1n })).toThrow(RangeError);
  });

  it("rejects indices beyond uint64", () => {
    expect(() => entriesPath({ index: 2n ** 64n })).toThrow(RangeError);
  });

  it("rejects empty or over-wide tiles", () => {
    expect(() => entriesPath({ index: 0n, width: 0 })).toThrow(RangeError);
    expect(() => entriesPath({ index: 0n, width: 257 })).toThrow(RangeError);
    expect(() => tilePath({ level: 0, index: 0n, width: 2.5 })).toThrow(
      RangeError,
    );
  });
});
