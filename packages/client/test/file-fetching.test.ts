import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppender } from "@tessellog/appender";
import { TILE_WIDTH, type Checkpoint, type Result } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { describe, expect, it } from "vitest";
import { createLogClient, type LogClient, type StreamedEntry } from "../src/index.js";
import { createFileFetcher } from "../src/node.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";
import { latestCheckpointOf } from "./fixtures/opened.js";
import { entriesFor } from "./fixtures/served-log.js";

const DISK_TIMEOUT_MS = 20_000;

const withTempLog = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "tessellog-client-"));
  try {
    await test(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const appendSession = async (root: string, entries: readonly Uint8Array[]): Promise<void> => {
  const driver = await openPosixDriver({ root });
  const appender = createAppender({ driver, signer: logSigner(), batching: { maxSize: 256, maxAge: 0 } });
  await Promise.all(entries.map((entry) => appender.add(entry)));
  await appender.shutdown();
  await driver.close();
};

const clientOn = (root: string): LogClient =>
  createLogClient({ fetcher: createFileFetcher({ root }), origin: LOG_KEY_NAME, logVerifier: logVerifier() });

const collect = async (
  stream: AsyncIterable<Result<StreamedEntry>>,
): Promise<readonly Result<StreamedEntry>[]> => {
  let collected: readonly Result<StreamedEntry>[] = [];
  for await (const item of stream) {
    collected = [...collected, item];
  }
  return collected;
};

describe("reading a POSIX log from disk", () => {
  it(
    "verifies the checkpoint, every entry and consistency across sessions",
    () =>
      withTempLog(async (root) => {
        const entries = entriesFor(300);
        await appendSession(root, entries.slice(0, 100));
        const first: Checkpoint = await latestCheckpointOf(clientOn(root));
        await appendSession(root, entries.slice(100));
        const client = clientOn(root);
        const second = await latestCheckpointOf(client);
        const streamed = await collect(client.entries({ checkpoint: second }));
        expect(second.size).toBe(300n);
        expect((await client.checkConsistency(first, second)).ok).toBe(true);
        expect(streamed.every((item) => item.ok)).toBe(true);
        expect(streamed.map((item) => item.ok && item.value.entry)).toEqual(entries);
      }),
    DISK_TIMEOUT_MS,
  );

  it("falls back to the full tile when a partial tile file is gone", () =>
    withTempLog(async (root) => {
      const entries = entriesFor(TILE_WIDTH + 1);
      await appendSession(root, entries);
      await rm(join(root, "tile", "0", "000.p", "1"), { force: true });
      const fetcher = createFileFetcher({ root });
      expect(await fetcher.readTile({ level: 0, index: 0n, width: 1 })).toEqual(
        (await fetcher.readTile({ level: 0, index: 0n, width: TILE_WIDTH }))?.slice(0, 32),
      );
    }));

  it("reports a log with no checkpoint", () =>
    withTempLog(async (root) => {
      expect(await clientOn(root).latestCheckpoint()).toEqual({
        ok: false,
        error: "log has no published checkpoint",
      });
    }));

  it("reports read failures other than a missing file", () =>
    withTempLog(async (root) => {
      await mkdir(join(root, "checkpoint"));
      await expect(createFileFetcher({ root }).readCheckpoint()).rejects.toThrow(/EISDIR/);
    }));
});
