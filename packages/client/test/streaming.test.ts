import { encodeBundle, entriesPath, TILE_WIDTH, tilePath, type Result, type TileAddress } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import type { StreamedEntry } from "../src/index.js";
import { clientFor } from "./fixtures/client.js";
import { latestCheckpointOf } from "./fixtures/opened.js";
import { entriesFor, servedLog } from "./fixtures/served-log.js";

const STREAM_TIMEOUT_MS = 20_000;

const collect = async (
  stream: AsyncIterable<Result<StreamedEntry>>,
): Promise<readonly Result<StreamedEntry>[]> => {
  let collected: readonly Result<StreamedEntry>[] = [];
  for await (const item of stream) {
    collected = [...collected, item];
  }
  return collected;
};

const asStreamed = (entries: readonly Uint8Array[], from: number) =>
  entries.map((entry, i) => ({ ok: true, value: { index: BigInt(from + i), entry } }));

describe("streaming verified entries", () => {
  it(
    "yields every entry of the log in order",
    async () => {
      const entries = entriesFor(300);
      const { files } = await servedLog(entries);
      const client = clientFor(files);
      const checkpoint = await latestCheckpointOf(client);
      expect(await collect(client.entries({ checkpoint }))).toEqual(asStreamed(entries, 0));
    },
    STREAM_TIMEOUT_MS,
  );

  it("yields a range that crosses a bundle boundary", async () => {
    const entries = entriesFor(300);
    const { files } = await servedLog(entries);
    const client = clientFor(files);
    const checkpoint = await latestCheckpointOf(client);
    expect(await collect(client.entries({ checkpoint, from: 250n, to: 260n }))).toEqual(
      asStreamed(entries.slice(250, 260), 250),
    );
  });

  it("yields nothing for an empty range", async () => {
    const { files } = await servedLog(entriesFor(3));
    const client = clientFor(files);
    const checkpoint = await latestCheckpointOf(client);
    expect(await collect(client.entries({ checkpoint, from: 2n, to: 2n }))).toEqual([]);
  });

  it("stops at an entry the server tampered with", async () => {
    const entries = entriesFor(5);
    const { files } = await servedLog(entries);
    const checkpoint = await latestCheckpointOf(clientFor(files));
    const tampered = [...entries.slice(0, 2), new TextEncoder().encode("forged"), ...entries.slice(3)];
    const served = new Map([...files, ["tile/entries/000.p/5", encodeBundle(tampered)]]);
    expect(await collect(clientFor(served).entries({ checkpoint }))).toEqual([
      ...asStreamed(entries.slice(0, 2), 0),
      { ok: false, error: "entry 2: calculated root does not match expected root" },
    ]);
  });

  it("refuses a range beyond the checkpoint", async () => {
    const { files } = await servedLog(entriesFor(3));
    const client = clientFor(files);
    const checkpoint = await latestCheckpointOf(client);
    expect(await collect(client.entries({ checkpoint, from: 2n, to: 4n }))).toEqual([
      { ok: false, error: "range [2, 4) is outside a checkpoint of size 3" },
    ]);
  });

  it("fails when the server is missing an entry bundle", async () => {
    const { files } = await servedLog(entriesFor(3));
    const checkpoint = await latestCheckpointOf(clientFor(files));
    const withoutBundles = new Map([...files].filter(([path]) => !path.startsWith("tile/entries/")));
    expect(await collect(clientFor(withoutBundles).entries({ checkpoint }))).toEqual([
      { ok: false, error: "missing entry bundle tile/entries/000.p/3" },
    ]);
  });

  it("fails when an entry bundle cannot be decoded", async () => {
    const { files } = await servedLog(entriesFor(3));
    const checkpoint = await latestCheckpointOf(clientFor(files));
    const corrupt = new Map([...files, ["tile/entries/000.p/3", Uint8Array.of(0x00)]]);
    expect(await collect(clientFor(corrupt).entries({ checkpoint }))).toEqual([
      { ok: false, error: "corrupt entry bundle tile/entries/000.p/3: truncated length prefix at offset 0" },
    ]);
  });
});

const MISMATCH = "calculated root does not match expected root";

const bundlePathOf = (bundle: number, size: number): string =>
  entriesPath({ index: BigInt(bundle), width: Math.min(TILE_WIDTH, size - bundle * TILE_WIDTH) });

const changedByte = (entry: Uint8Array): Uint8Array => entry.map((byte, i) => (i === 0 ? byte ^ 0x01 : byte));

const withBundle = (
  files: ReadonlyMap<string, Uint8Array>,
  size: number,
  bundle: number,
  edit: (entries: readonly Uint8Array[]) => readonly Uint8Array[],
  entries: readonly Uint8Array[],
): ReadonlyMap<string, Uint8Array> =>
  new Map([
    ...files,
    [bundlePathOf(bundle, size), encodeBundle(edit(entries.slice(bundle * TILE_WIDTH, (bundle + 1) * TILE_WIDTH)))],
  ]);

const withTileHashChanged = (
  files: ReadonlyMap<string, Uint8Array>,
  address: TileAddress,
  position: number,
): ReadonlyMap<string, Uint8Array> => {
  const path = tilePath(address);
  const tile = files.get(path) ?? new Uint8Array();
  return new Map([...files, [path, tile.map((byte, i) => (i === position * 32 ? byte ^ 0x01 : byte))]]);
};

const streamOf = async (
  files: ReadonlyMap<string, Uint8Array>,
  verifiedFiles: ReadonlyMap<string, Uint8Array>,
  range: { readonly from?: bigint; readonly to?: bigint } = {},
) => {
  const checkpoint = await latestCheckpointOf(clientFor(verifiedFiles));
  return collect(clientFor(files).entries({ checkpoint, ...range }));
};

const failedAt = (index: number) => ({ ok: false, error: `entry ${index}: ${MISMATCH}` });

describe("refusing a bundle the server tampered with", () => {
  it.each([256, 384, 511])("stops at a changed byte in entry %i of a full bundle", async (changed) => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const tampered = withBundle(files, 600, 1, (bundle) => bundle.map((entry, i) => (256 + i === changed ? changedByte(entry) : entry)), entries);
    expect(await streamOf(tampered, files)).toEqual([...asStreamed(entries.slice(0, changed), 0), failedAt(changed)]);
  });

  it("stops at a changed byte in an entry of the partial bundle at the edge of the tree", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const tampered = withBundle(files, 600, 2, (bundle) => bundle.map((entry, i) => (512 + i === 590 ? changedByte(entry) : entry)), entries);
    expect(await streamOf(tampered, files)).toEqual([...asStreamed(entries.slice(0, 590), 0), failedAt(590)]);
  });

  it("stops at two swapped entries", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const swapped = withBundle(
      files,
      600,
      1,
      (bundle) => [...bundle.slice(0, 44), bundle[45] ?? new Uint8Array(), bundle[44] ?? new Uint8Array(), ...bundle.slice(46)],
      entries,
    );
    expect(await streamOf(swapped, files)).toEqual([...asStreamed(entries.slice(0, 300), 0), failedAt(300)]);
  });

  it("refuses a full bundle with an entry missing from its end", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const shortened = withBundle(files, 600, 1, (bundle) => bundle.slice(0, -1), entries);
    expect(await streamOf(shortened, files)).toEqual([
      ...asStreamed(entries.slice(0, 256), 0),
      { ok: false, error: "entry bundle tile/entries/001 holds 255 entries, want 256" },
    ]);
  });

  it("refuses an edge bundle with an entry missing from its end", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const shortened = withBundle(files, 600, 2, (bundle) => bundle.slice(0, -1), entries);
    expect(await streamOf(shortened, files)).toEqual([
      ...asStreamed(entries.slice(0, 512), 0),
      { ok: false, error: "entry bundle tile/entries/002.p/88 holds 87 entries, want 88" },
    ]);
  });

  it("refuses an edge bundle with an extra entry at its end", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const lengthened = withBundle(files, 600, 2, (bundle) => [...bundle, new TextEncoder().encode("extra")], entries);
    expect(await streamOf(lengthened, files)).toEqual([
      ...asStreamed(entries.slice(0, 512), 0),
      { ok: false, error: "entry bundle tile/entries/002.p/88 holds 89 entries, want 88" },
    ]);
  });

  it("stops at an entry inserted into the middle of an edge bundle", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const inserted = withBundle(
      files,
      600,
      2,
      (bundle) => [...bundle.slice(0, 10), new TextEncoder().encode("inserted"), ...bundle.slice(10, -1)],
      entries,
    );
    expect(await streamOf(inserted, files)).toEqual([...asStreamed(entries.slice(0, 522), 0), failedAt(522)]);
  });
});

describe("refusing tiles the server tampered with", () => {
  it("stops at the first entry whose proof needs a changed level-0 tile", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const tampered = withTileHashChanged(files, { level: 0, index: 1n, width: TILE_WIDTH }, 5);
    expect(await streamOf(tampered, files)).toEqual([...asStreamed(entries.slice(0, 256), 0), failedAt(256)]);
  });

  it("refuses an edge bundle whose level-0 tile disagrees with it", async () => {
    const entries = entriesFor(257);
    const { files } = await servedLog(entries);
    const tampered = withTileHashChanged(files, { level: 0, index: 1n, width: 1 }, 0);
    expect(await streamOf(tampered, files, { from: 256n })).toEqual([
      ...asStreamed(entries.slice(256), 256),
      { ok: false, error: "entry bundle tile/entries/001.p/1 does not match tile tile/0/001.p/1" },
    ]);
  });

  it("stops at the first entry whose proof needs a changed level-1 tile", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const tampered = withTileHashChanged(files, { level: 1, index: 0n, width: 2 }, 0);
    expect(await streamOf(tampered, files)).toEqual([...asStreamed(entries.slice(0, 256), 0), failedAt(256)]);
  });
});

describe("verifying whole bundles around a requested range", () => {
  const tamperedEntry = async (changed: number) => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const bundle = Math.floor(changed / TILE_WIDTH);
    const tampered = withBundle(
      files,
      600,
      bundle,
      (run) => run.map((entry, i) => (bundle * TILE_WIDTH + i === changed ? changedByte(entry) : entry)),
      entries,
    );
    return { entries, files, tampered };
  };

  it("refuses a range whose bundle was tampered with after the range ends", async () => {
    const { entries, files, tampered } = await tamperedEntry(400);
    expect(await streamOf(tampered, files, { from: 256n, to: 266n })).toEqual([
      ...asStreamed(entries.slice(256, 266), 256),
      failedAt(400),
    ]);
  });

  it("refuses a range whose bundle was tampered with before the range starts", async () => {
    const { files, tampered } = await tamperedEntry(260);
    expect(await streamOf(tampered, files, { from: 300n, to: 310n })).toEqual([failedAt(260)]);
  });

  it("refuses a range ending partway through a bundle tampered with after it", async () => {
    const { entries, files, tampered } = await tamperedEntry(530);
    expect(await streamOf(tampered, files, { from: 500n, to: 520n })).toEqual([
      ...asStreamed(entries.slice(500, 520), 500),
      failedAt(530),
    ]);
  });
});

describe("streaming logs at tile boundaries", () => {
  it.each([1, 255, 256, 257, 512, 513])("yields every entry of a %i-entry log", async (size) => {
    const entries = entriesFor(size);
    const { files } = await servedLog(entries);
    expect(await streamOf(files, files)).toEqual(asStreamed(entries, 0));
  });

  it.each([1, 255, 256, 257, 512, 513])("stops at a changed last entry of a %i-entry log", async (size) => {
    const entries = entriesFor(size);
    const { files } = await servedLog(entries);
    const last = Math.floor((size - 1) / TILE_WIDTH);
    const tampered = withBundle(files, size, last, (bundle) => bundle.map((entry, i) => (i === bundle.length - 1 ? changedByte(entry) : entry)), entries);
    expect(await streamOf(tampered, files)).toEqual([...asStreamed(entries.slice(0, size - 1), 0), failedAt(size - 1)]);
  });

  it("yields exactly the requested entries for many ranges", async () => {
    const entries = entriesFor(600);
    const { files } = await servedLog(entries);
    const ranges = Array.from({ length: 25 }, (_, i) => {
      const a = (i * 7919 + 13) % 601;
      const b = (i * 104729 + 71) % 601;
      return [Math.min(a, b), Math.max(a, b)] as const;
    });
    const streamed = await Promise.all(ranges.map(([from, to]) => streamOf(files, files, { from: BigInt(from), to: BigInt(to) })));
    expect(streamed).toEqual(ranges.map(([from, to]) => asStreamed(entries.slice(from, to), from)));
  });
});
