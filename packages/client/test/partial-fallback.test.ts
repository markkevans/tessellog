import { decodeBundle, encodeBundle } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { createHttpFetcher } from "../src/index.js";
import { BASE_URL, entriesFor, fakeServer, servedLog } from "./fixtures/served-log.js";

const HASH_BYTES = 32;

const fetcherFor = (files: ReadonlyMap<string, Uint8Array>) =>
  createHttpFetcher({ baseUrl: BASE_URL, fetch: fakeServer(files).fetch });

describe("falling back to full tiles when partials are gone", () => {
  it("serves a missing partial tile from the start of the full tile", async () => {
    const { files } = await servedLog(entriesFor(512));
    const fullTile = files.get("tile/0/001");
    expect(await fetcherFor(files).readTile({ level: 0, index: 1n, width: 44 })).toEqual(
      fullTile?.slice(0, 44 * HASH_BYTES),
    );
  });

  it("serves a missing partial bundle from the start of the full bundle", async () => {
    const entries = entriesFor(512);
    const { files } = await servedLog(entries);
    expect(await fetcherFor(files).readEntryBundle({ index: 1n, width: 44 })).toEqual(
      encodeBundle(entries.slice(256, 300)),
    );
  });

  it("reports a partial as missing when the full tile is missing too", async () => {
    const { files } = await servedLog(entriesFor(300));
    const withoutPartial = new Map([...files].filter(([path]) => path !== "tile/0/001.p/44"));
    expect(
      await fetcherFor(withoutPartial).readTile({ level: 0, index: 1n, width: 44 }),
    ).toBeUndefined();
  });

  it("reports a partial bundle as missing when the full bundle is missing too", async () => {
    const { files } = await servedLog(entriesFor(300));
    const withoutPartial = new Map([...files].filter(([path]) => path !== "tile/entries/001.p/44"));
    expect(
      await fetcherFor(withoutPartial).readEntryBundle({ index: 1n, width: 44 }),
    ).toBeUndefined();
  });

  it("rejects a full bundle that cannot be decoded", async () => {
    const files = new Map([["tile/entries/000", Uint8Array.of(0x00)]]);
    await expect(fetcherFor(files).readEntryBundle({ index: 0n, width: 1 })).rejects.toThrow(
      "corrupt entry bundle tile/entries/000",
    );
  });

  it("prefers the partial when the server still has it", async () => {
    const { files } = await servedLog(entriesFor(300));
    const decoded = decodeBundle(
      (await fetcherFor(files).readEntryBundle({ index: 1n, width: 44 })) ?? new Uint8Array(),
    );
    expect(decoded.ok && decoded.value.length).toBe(44);
  });
});
