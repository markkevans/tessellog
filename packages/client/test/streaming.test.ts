import { encodeBundle, type Result } from "@tessellog/core";
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
