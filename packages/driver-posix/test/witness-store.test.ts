import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describeWitnessStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { openPosixWitnessStore } from "../src/index.js";
import { makeTempDir, removeDir } from "./fixtures/temp-dir.js";

const ORIGIN = "example.com/log";

const checkpoint = (size: bigint) => ({ size, rootHash: new Uint8Array(32).fill(Number(size)) });

describeWitnessStore("the POSIX witness store", async () => {
  const root = await makeTempDir();
  const store = await openPosixWitnessStore({ root });
  return {
    store,
    cleanup: async () => {
      await store.close();
      await removeDir(root);
    },
  };
});

const withTempDir = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await makeTempDir();
  try {
    await test(root);
  } finally {
    await removeDir(root);
  }
};

const checkpointFiles = async (root: string): Promise<readonly string[]> =>
  (await readdir(join(root, "checkpoints"))).filter((name) => !name.includes(".tmp-"));

describe("persisting the witness store", () => {
  it("remembers each log's latest checkpoint after reopening", () =>
    withTempDir(async (root) => {
      const first = await openPosixWitnessStore({ root });
      await first.advance(ORIGIN, 0n, checkpoint(3n));
      await first.advance(ORIGIN, 3n, checkpoint(8n));
      await first.close();
      const reopened = await openPosixWitnessStore({ root });
      expect(await reopened.latest(ORIGIN)).toEqual(checkpoint(8n));
      expect(await reopened.advance(ORIGIN, 3n, checkpoint(9n))).toBe(false);
      await reopened.close();
    }));

  it("refuses a second store on the same directory while the first is open", () =>
    withTempDir(async (root) => {
      const first = await openPosixWitnessStore({ root });
      await expect(openPosixWitnessStore({ root })).rejects.toThrow(/cannot lock witness directory/);
      await first.close();
      const second = await openPosixWitnessStore({ root });
      await second.close();
    }));

  it("keeps origins that differ only in characters unsafe for file names apart", () =>
    withTempDir(async (root) => {
      const store = await openPosixWitnessStore({ root });
      await store.advance("example.com/a/b", 0n, checkpoint(1n));
      await store.advance("example.com/a_b", 0n, checkpoint(2n));
      expect(await store.latest("example.com/a/b")).toEqual(checkpoint(1n));
      expect(await store.latest("example.com/a_b")).toEqual(checkpoint(2n));
      expect(await checkpointFiles(root)).toHaveLength(2);
      await store.close();
    }));

  it("refuses to read a damaged checkpoint record", () =>
    withTempDir(async (root) => {
      const store = await openPosixWitnessStore({ root });
      await store.advance(ORIGIN, 0n, checkpoint(3n));
      const [file = ""] = await checkpointFiles(root);
      await writeFile(join(root, "checkpoints", file), new Uint8Array(39));
      await expect(store.latest(ORIGIN)).rejects.toThrow(`corrupt witness record for ${ORIGIN}`);
      await store.close();
    }));

  it("keeps advancing other logs after advancing one fails on a damaged record", () =>
    withTempDir(async (root) => {
      const store = await openPosixWitnessStore({ root });
      await store.advance(ORIGIN, 0n, checkpoint(3n));
      const [file = ""] = await checkpointFiles(root);
      await writeFile(join(root, "checkpoints", file), new Uint8Array(39));
      await expect(store.advance(ORIGIN, 3n, checkpoint(4n))).rejects.toThrow(`corrupt witness record for ${ORIGIN}`);
      expect(await store.advance("example.com/other", 0n, checkpoint(5n))).toBe(true);
      await store.close();
    }));

  it("refuses a record that belongs to a different origin", () =>
    withTempDir(async (root) => {
      const store = await openPosixWitnessStore({ root });
      await store.advance(ORIGIN, 0n, checkpoint(3n));
      await store.advance("example.com/other", 0n, checkpoint(4n));
      const [a = "", b = ""] = await checkpointFiles(root);
      await writeFile(join(root, "checkpoints", a), await readFile(join(root, "checkpoints", b)));
      const outcomes = await Promise.allSettled([store.latest(ORIGIN), store.latest("example.com/other")]);
      expect(outcomes.map(({ status }) => status).sort()).toEqual(["fulfilled", "rejected"]);
      await store.close();
    }));
});
