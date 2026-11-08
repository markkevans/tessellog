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
