import { describe, expect, it } from "vitest";
import {
  formatCheckpoint,
  parseCheckpoint,
  toHex,
  type Checkpoint,
} from "../src/index.js";

const EIGHT_LEAF_ROOT_BASE64 = "XcnaeacGWamtVZy3Ad7ZoqudgjqtL0lgz+Nw7/RgQyg=";
const EIGHT_LEAF_ROOT_HEX =
  "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328";

const hexBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

const checkpoint = (overrides?: Partial<Checkpoint>): Checkpoint => ({
  origin: "example.com/log",
  size: 8n,
  rootHash: hexBytes(EIGHT_LEAF_ROOT_HEX),
  extensions: [],
  ...overrides,
});

const body = (...lines: readonly string[]): string =>
  lines.map((line) => `${line}\n`).join("");

describe("formatting checkpoints (tlog-checkpoint)", () => {
  it("writes origin, decimal size and base64 root hash on separate lines", () => {
    expect(formatCheckpoint(checkpoint())).toBe(
      body("example.com/log", "8", EIGHT_LEAF_ROOT_BASE64),
    );
  });

  it("appends extension lines after the root hash", () => {
    expect(
      formatCheckpoint(checkpoint({ extensions: ["6086d1a9", "Waxing gibbous"] })),
    ).toBe(
      body("example.com/log", "8", EIGHT_LEAF_ROOT_BASE64, "6086d1a9", "Waxing gibbous"),
    );
  });

  it("writes sizes across the full uint64 range", () => {
    expect(formatCheckpoint(checkpoint({ size: 2n ** 64n - 1n }))).toBe(
      body("example.com/log", "18446744073709551615", EIGHT_LEAF_ROOT_BASE64),
    );
  });

  it.each<[string, Partial<Checkpoint>]>([
    ["an empty origin", { origin: "" }],
    ["an origin spanning lines", { origin: "a\nb" }],
    ["a negative size", { size: -1n }],
    ["a size beyond uint64", { size: 2n ** 64n }],
    ["a root hash that is not SHA-256 sized", { rootHash: new Uint8Array(31) }],
    ["an empty extension line", { extensions: [""] }],
    ["an extension spanning lines", { extensions: ["a\nb"] }],
  ])("refuses to format %s", (_, overrides) => {
    expect(() => formatCheckpoint(checkpoint(overrides))).toThrow(RangeError);
  });
});

describe("parsing checkpoints from untrusted text", () => {
  it("reads origin, size and root hash", () => {
    const parsed = parseCheckpoint(body("example.com/log", "8", EIGHT_LEAF_ROOT_BASE64));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.value.origin).toBe("example.com/log");
    expect(parsed.ok && parsed.value.size).toBe(8n);
    expect(parsed.ok && toHex(parsed.value.rootHash)).toBe(EIGHT_LEAF_ROOT_HEX);
    expect(parsed.ok && parsed.value.extensions).toEqual([]);
  });

  it("round-trips a formatted checkpoint with extensions", () => {
    const original = checkpoint({ size: 2n ** 64n - 1n, extensions: ["lots", "of", "lines"] });
    expect(parseCheckpoint(formatCheckpoint(original))).toEqual({
      ok: true,
      value: original,
    });
  });

  it.each([
    ["too few lines", body("Head", "9944")],
    ["an empty origin", body("", "8", EIGHT_LEAF_ROOT_BASE64)],
    ["a missing final newline", `example.com/log\n8\n${EIGHT_LEAF_ROOT_BASE64}`],
    ["a size that is not a number", body("Log", "bananas", EIGHT_LEAF_ROOT_BASE64)],
    ["a negative size", body("Log", "-34", EIGHT_LEAF_ROOT_BASE64)],
    ["a signed size", body("Log", "+34", EIGHT_LEAF_ROOT_BASE64)],
    ["a size with leading zeros", body("Log", "08", EIGHT_LEAF_ROOT_BASE64)],
    ["a size beyond uint64", body("Log", "18446744073709551616", EIGHT_LEAF_ROOT_BASE64)],
    ["a root hash that is not base64", body("Log", "123", "ThisIsn'tBase64")],
    [
      "a non-canonical base64 root hash",
      body("Log", "123", "XcnaeacGWamtVZy3Ad7ZoqudgjqtL0lgz+Nw7/RgQyh="),
    ],
    ["a root hash that is not SHA-256 sized", body("Log", "123", "YmFuYW5hcw==")],
    ["a carriage return", `Log\r\n123\n${EIGHT_LEAF_ROOT_BASE64}\n`],
    ["a carriage return in an extension", body("Log", "123", EIGHT_LEAF_ROOT_BASE64, "ext\r")],
    ["an empty extension line", body("Log", "123", EIGHT_LEAF_ROOT_BASE64, "")],
  ])("rejects %s", (_, text) => {
    expect(parseCheckpoint(text).ok).toBe(false);
  });

  it("accepts size zero", () => {
    const parsed = parseCheckpoint(body("Log", "0", "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="));
    expect(parsed.ok && parsed.value.size).toBe(0n);
  });
});
