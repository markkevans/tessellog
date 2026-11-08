import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openPosixDriver } from "../src/index.js";
import { allFiles, makeTempDir, removeDir } from "./fixtures/temp-dir.js";

const withTempLog = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await makeTempDir();
  try {
    await test(root);
  } finally {
    await removeDir(root);
  }
};

describe("allowing one writer per log directory", () => {
  it("refuses a second driver while the first is open", () =>
    withTempLog(async (root) => {
      const first = await openPosixDriver({ root });
      await expect(openPosixDriver({ root })).rejects.toThrow(
        `cannot lock log directory ${root}: remove ${root}/.state/lock if no writer is running`,
      );
      await first.close();
    }));

  it("allows a new driver once the first is closed", () =>
    withTempLog(async (root) => {
      await (await openPosixDriver({ root })).close();
      const reopened = await openPosixDriver({ root });
      await reopened.close();
    }));

  it("removes its lock file when closed", () =>
    withTempLog(async (root) => {
      await (await openPosixDriver({ root })).close();
      expect(await allFiles(root)).not.toContain(".state/lock");
    }));
});

describe("releasing the lock when opening fails", () => {
  it("can open the directory once corrupt state is repaired", () =>
    withTempLog(async (root) => {
      await mkdir(join(root, ".state"), { recursive: true });
      await writeFile(join(root, ".state", "tree"), "not a tree state\n");
      await expect(openPosixDriver({ root })).rejects.toThrow(/corrupt tree state/);
      await rm(join(root, ".state", "tree"));
      const repaired = await openPosixDriver({ root });
      await repaired.close();
    }));
});
