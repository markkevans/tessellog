import { describe, expect, it } from "vitest";
import { decodeBundle, encodeBundle } from "../src/index.js";

const bytes = (...values: readonly number[]): Uint8Array =>
  Uint8Array.from(values);

const entryOfLength = (length: number): Uint8Array =>
  new Uint8Array(length).fill(0xab);

describe("encoding entry bundles (tlog-tiles)", () => {
  it("prefixes each entry with its big-endian uint16 length", () => {
    expect(encodeBundle([bytes(0x61), bytes(0x62, 0x63)])).toEqual(
      bytes(0x00, 0x01, 0x61, 0x00, 0x02, 0x62, 0x63),
    );
  });

  it("allows empty entries", () => {
    expect(encodeBundle([bytes()])).toEqual(bytes(0x00, 0x00));
  });

  it("accepts entries up to 65535 bytes", () => {
    expect(encodeBundle([entryOfLength(65_535)]).length).toBe(65_537);
  });

  it("rejects entries that do not fit a uint16 length", () => {
    expect(() => encodeBundle([entryOfLength(65_536)])).toThrow(RangeError);
  });

  it("rejects more entries than fit in one tile", () => {
    const entries = Array.from({ length: 257 }, () => bytes(0x01));
    expect(() => encodeBundle(entries)).toThrow(RangeError);
  });
});

describe("decoding entry bundles from untrusted bytes", () => {
  it("recovers the entries that were encoded", () => {
    const entries = [bytes(0x61), bytes(), entryOfLength(300)];
    expect(decodeBundle(encodeBundle(entries))).toEqual({
      ok: true,
      value: entries,
    });
  });

  it("decodes an empty bundle to no entries", () => {
    expect(decodeBundle(bytes())).toEqual({ ok: true, value: [] });
  });

  it("reports a truncated length prefix", () => {
    expect(decodeBundle(bytes(0x00))).toEqual({
      ok: false,
      error: "truncated length prefix at offset 0",
    });
  });

  it("reports an entry that runs past the end of the bundle", () => {
    expect(decodeBundle(bytes(0x00, 0x01, 0x61, 0x00, 0x05, 0x62))).toEqual({
      ok: false,
      error: "entry at offset 3 needs 5 bytes but 1 remain",
    });
  });

  it("reports bundles holding more entries than fit in one tile", () => {
    const oversized = Uint8Array.from(
      Array.from({ length: 257 }, () => [0x00, 0x00]).flat(),
    );
    expect(decodeBundle(oversized)).toEqual({
      ok: false,
      error: "bundle holds more than 256 entries",
    });
  });
});
