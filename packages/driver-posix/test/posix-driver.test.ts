import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeBundle } from "@tessellog/core";
import { describeLogDriver } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { openPosixDriver } from "../src/index.js";
import { allFiles, makeTempDir, removeDir } from "./fixtures/temp-dir.js";

describeLogDriver("the POSIX driver", async () => {
  const root = await makeTempDir();
  const driver = await openPosixDriver({ root });
  return {
    driver,
    cleanup: async () => {
      await driver.close();
      await removeDir(root);
    },
  };
});

const withTempLog = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await makeTempDir();
  try {
    await test(root);
  } finally {
    await removeDir(root);
  }
};

describe("storing a log in a directory", () => {
  it("writes tiles, entry bundles and the checkpoint at tlog-tiles paths", () =>
    withTempLog(async (root) => {
      const driver = await openPosixDriver({ root });
      const hashes = new Uint8Array(64).fill(7);
      const bundle = encodeBundle([Uint8Array.of(1), Uint8Array.of(2)]);
      const checkpoint = new TextEncoder().encode("example\n2\nroot\n");
      await driver.writeIntegration({
        size: 2n,
        rootHash: new Uint8Array(32),
        tiles: [{ level: 0, index: 0n, width: 2, hashes }],
        bundles: [{ index: 0n, width: 2, data: bundle }],
      });
      await driver.writeCheckpoint(checkpoint);
      await driver.close();
      expect(new Uint8Array(await readFile(join(root, "tile/0/000.p/2")))).toEqual(hashes);
      expect(new Uint8Array(await readFile(join(root, "tile/entries/000.p/2")))).toEqual(bundle);
      expect(new Uint8Array(await readFile(join(root, "checkpoint")))).toEqual(checkpoint);
    }));

  it("leaves no temporary files behind", () =>
    withTempLog(async (root) => {
      const driver = await openPosixDriver({ root });
      await driver.writeCheckpoint(new TextEncoder().encode("one\n"));
      await driver.writeCheckpoint(new TextEncoder().encode("two\n"));
      await driver.close();
      expect((await allFiles(root)).filter((file) => file.includes(".tmp"))).toEqual([]);
    }));
});

describe("surfacing storage failures", () => {
  it("reports read failures other than a missing file", () =>
    withTempLog(async (root) => {
      await mkdir(join(root, "checkpoint"), { recursive: true });
      const driver = await openPosixDriver({ root });
      await expect(driver.readCheckpoint()).rejects.toThrow(/EISDIR/);
      await driver.close();
    }));
});
