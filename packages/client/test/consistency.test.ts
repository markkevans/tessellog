import type { Checkpoint } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { clientFor } from "./fixtures/client.js";
import { latestCheckpointOf } from "./fixtures/opened.js";
import { entriesFor, servedLog } from "./fixtures/served-log.js";

const LARGE_LOG_TIMEOUT_MS = 20_000;

const checkpointOf = async (entries: readonly Uint8Array[]): Promise<Checkpoint> =>
  latestCheckpointOf(clientFor((await servedLog(entries)).files));

describe("checking a log only grows", () => {
  it.each([1, 255, 256, 257, 599])(
    "accepts the log growing from %i entries to 600",
    async (olderSize) => {
      const entries = entriesFor(600);
      const older = await checkpointOf(entries.slice(0, olderSize));
      const { files } = await servedLog(entries);
      const client = clientFor(files);
      const newer = await latestCheckpointOf(client);
      expect(await client.checkConsistency(older, newer)).toEqual({ ok: true, value: undefined });
    },
    LARGE_LOG_TIMEOUT_MS,
  );

  it("accepts an unchanged checkpoint", async () => {
    const { files } = await servedLog(entriesFor(10));
    const client = clientFor(files);
    const checkpoint = await latestCheckpointOf(client);
    expect((await client.checkConsistency(checkpoint, checkpoint)).ok).toBe(true);
  });

  it("accepts any log as a continuation of the empty log", async () => {
    const older = await checkpointOf([]);
    const { files } = await servedLog(entriesFor(10));
    const client = clientFor(files);
    expect((await client.checkConsistency(older, await latestCheckpointOf(client))).ok).toBe(true);
  });

  it("detects a fork that rewrote earlier entries", async () => {
    const older = await checkpointOf(entriesFor(5, "forked"));
    const { files } = await servedLog(entriesFor(10));
    const client = clientFor(files);
    const result = await client.checkConsistency(older, await latestCheckpointOf(client));
    expect(result).toEqual({
      ok: false,
      error: "calculated old root does not match expected old root",
    });
  });

  it("detects two different trees of the same size", async () => {
    const older = await checkpointOf(entriesFor(10, "forked"));
    const { files } = await servedLog(entriesFor(10));
    const client = clientFor(files);
    const result = await client.checkConsistency(older, await latestCheckpointOf(client));
    expect(result).toEqual({ ok: false, error: "calculated root does not match expected root" });
  });

  it("rejects a log that shrank", async () => {
    const { files } = await servedLog(entriesFor(10));
    const client = clientFor(files);
    const newer = await latestCheckpointOf(client);
    const older = await checkpointOf(entriesFor(20));
    expect(await client.checkConsistency(older, newer)).toEqual({
      ok: false,
      error: "newer checkpoint of size 10 is smaller than older checkpoint of size 20",
    });
  });

  it("fails when the server is missing a tile the proof needs", async () => {
    const entries = entriesFor(10);
    const older = await checkpointOf(entries.slice(0, 3));
    const { files } = await servedLog(entries);
    const newer = await latestCheckpointOf(clientFor(files));
    const withoutTiles = new Map([...files].filter(([path]) => !path.startsWith("tile/0/")));
    expect(await clientFor(withoutTiles).checkConsistency(older, newer)).toEqual({
      ok: false,
      error: "missing tile tile/0/000.p/10",
    });
  });
});
