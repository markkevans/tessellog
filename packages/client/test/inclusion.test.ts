import { describe, expect, it } from "vitest";
import { clientFor } from "./fixtures/client.js";
import { latestCheckpointOf } from "./fixtures/opened.js";
import { entriesFor, servedLog } from "./fixtures/served-log.js";

const LARGE_LOG_TIMEOUT_MS = 20_000;

describe("proving an entry is in the log", () => {
  it.each([1, 257, 600])(
    "proves every entry of a %i-entry log",
    async (count) => {
      const entries = entriesFor(count);
      const { files } = await servedLog(entries);
      const client = clientFor(files);
      const checkpoint = await latestCheckpointOf(client);
      const results = await Promise.all(
        entries.map((entry, index) =>
          client.proveInclusion({ entry, index: BigInt(index), checkpoint }),
        ),
      );
      expect(results.filter((result) => !result.ok)).toEqual([]);
    },
    LARGE_LOG_TIMEOUT_MS,
  );

  it("rejects an entry that is not at that index", async () => {
    const { files } = await servedLog(entriesFor(10));
    const client = clientFor(files);
    const checkpoint = await latestCheckpointOf(client);
    const result = await client.proveInclusion({
      entry: new TextEncoder().encode("not in the log"),
      index: 3n,
      checkpoint,
    });
    expect(result).toEqual({ ok: false, error: "calculated root does not match expected root" });
  });

  it("rejects an index beyond the checkpoint", async () => {
    const entries = entriesFor(10);
    const { files } = await servedLog(entries);
    const client = clientFor(files);
    const checkpoint = await latestCheckpointOf(client);
    expect(
      await client.proveInclusion({ entry: entries[0] ?? new Uint8Array(), index: 10n, checkpoint }),
    ).toEqual({ ok: false, error: "index 10 is outside a checkpoint of size 10" });
  });

  it("fails when the server is missing a tile the proof needs", async () => {
    const entries = entriesFor(10);
    const { files } = await servedLog(entries);
    const checkpoint = await latestCheckpointOf(clientFor(files));
    const withoutTiles = new Map([...files].filter(([path]) => !path.startsWith("tile/0/")));
    const result = await clientFor(withoutTiles).proveInclusion({
      entry: entries[0] ?? new Uint8Array(),
      index: 0n,
      checkpoint,
    });
    expect(result).toEqual({ ok: false, error: "missing tile tile/0/000.p/10" });
  });
});
