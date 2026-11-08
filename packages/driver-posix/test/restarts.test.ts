import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAppender } from "@tessellog/appender";
import {
  consistencyProofFromTiles,
  openCheckpoint,
  rootHash,
  tilePath,
  verifyConsistency,
  type Checkpoint,
  type TileAddress,
} from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { openPosixDriver, type PosixDriver } from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";
import { makeTempDir, removeDir } from "./fixtures/temp-dir.js";

const entry = (i: number): Uint8Array => new TextEncoder().encode(`entry ${i}`);

const withTempLog = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await makeTempDir();
  try {
    await test(root);
  } finally {
    await removeDir(root);
  }
};

const session = async <T>(root: string, work: (driver: PosixDriver) => Promise<T>): Promise<T> => {
  const driver = await openPosixDriver({ root });
  try {
    return await work(driver);
  } finally {
    await driver.close();
  }
};

const publishedCheckpoint = async (driver: PosixDriver): Promise<Checkpoint> => {
  const message = await driver.readCheckpoint();
  const opened =
    message && (await openCheckpoint({ message, origin: LOG_KEY_NAME, logVerifier: logVerifier() }));
  if (!opened?.ok) {
    throw new Error("checkpoint did not open");
  }
  return opened.value.checkpoint;
};

const appendAll = async (driver: PosixDriver, entries: readonly Uint8Array[]) => {
  const appender = createAppender({ driver, signer: logSigner(), batching: { maxSize: 1 } });
  const indices = await entries.reduce<Promise<readonly bigint[]>>(
    async (previous, next) => [...(await previous), (await appender.add(next)).index],
    Promise.resolve([]),
  );
  await appender.shutdown();
  return indices;
};

describe("reopening a POSIX log directory", () => {
  it("continues sequencing from the last index", () =>
    withTempLog(async (root) => {
      await session(root, (driver) => driver.sequence([entry(0), entry(1), entry(2)]));
      expect(await session(root, (driver) => driver.sequence([entry(3)]))).toBe(3n);
    }));

  it("keeps entries that were sequenced but not yet integrated", () =>
    withTempLog(async (root) => {
      await session(root, async (driver) => {
        await driver.sequence([entry(0), entry(1)]);
        await driver.sequence([entry(2)]);
      });
      expect(await session(root, (driver) => driver.readSequenced(1n))).toEqual([entry(1), entry(2)]);
    }));

  it("keeps the integrated tree state", () =>
    withTempLog(async (root) => {
      const root2 = rootHash([entry(0), entry(1)]);
      await session(root, (driver) =>
        driver.writeIntegration({ size: 2n, rootHash: root2, tiles: [], bundles: [] }),
      );
      expect(await session(root, (driver) => driver.readTreeState())).toEqual({
        size: 2n,
        rootHash: root2,
      });
    }));

  it("grows one consistent log across appender sessions", () =>
    withTempLog(async (root) => {
      const firstIndices = await session(root, (driver) =>
        appendAll(driver, Array.from({ length: 10 }, (_, i) => entry(i))),
      );
      const first = await session(root, publishedCheckpoint);
      const secondIndices = await session(root, (driver) =>
        appendAll(driver, Array.from({ length: 5 }, (_, i) => entry(10 + i))),
      );
      const second = await session(root, publishedCheckpoint);
      const proof = await session(root, (driver) =>
        consistencyProofFromTiles({
          oldSize: first.size,
          newSize: second.size,
          readTile: async (address: TileAddress) => {
            const tile = await driver.readTile(address);
            if (tile === undefined) {
              throw new Error(`missing tile ${tilePath(address)}`);
            }
            return tile;
          },
        }),
      );
      expect([...firstIndices, ...secondIndices]).toEqual(
        Array.from({ length: 15 }, (_, i) => BigInt(i)),
      );
      expect(second.size).toBe(15n);
      expect(
        verifyConsistency({
          oldSize: first.size,
          newSize: second.size,
          oldRoot: first.rootHash,
          newRoot: second.rootHash,
          proof,
        }).ok,
      ).toBe(true);
    }));
});

describe("refusing corrupt state", () => {
  const stateFile = async (root: string, name: string): Promise<string> => {
    await session(root, (driver) => driver.sequence([entry(0)]));
    const stateDir = join(root, ".state");
    const files = await readdir(stateDir, { recursive: true });
    const match = files.find((file) => file.startsWith(`${name}/`));
    if (match === undefined) {
      throw new Error(`no ${name} state file in ${files.join(", ")}`);
    }
    return join(stateDir, match);
  };

  it("refuses to open with a corrupt tree state", () =>
    withTempLog(async (root) => {
      await mkdir(join(root, ".state"), { recursive: true });
      await writeFile(join(root, ".state", "tree"), "not a tree state\n");
      await expect(openPosixDriver({ root })).rejects.toThrow(/corrupt tree state/);
    }));

  it.each([
    ["an entry longer than the file", Uint8Array.of(0, 0, 0, 9, 1)],
    ["a truncated length prefix", Uint8Array.of(0, 0)],
  ])("refuses to open with a sequenced batch holding %s", (_, contents) =>
    withTempLog(async (root) => {
      const batch = await stateFile(root, "sequenced");
      await writeFile(batch, contents);
      await expect(openPosixDriver({ root })).rejects.toThrow(/corrupt sequenced batch/);
    }));

  it("refuses to open when the tree state belongs to something else", () =>
    withTempLog(async (root) => {
      await mkdir(join(root, ".state"), { recursive: true });
      await writeFile(
        join(root, ".state", "tree"),
        "example.com/log\n0\n47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=\n",
      );
      await expect(openPosixDriver({ root })).rejects.toThrow(/corrupt tree state: unexpected origin/);
    }));

  it("refuses to open when the sequenced directory is not a directory", () =>
    withTempLog(async (root) => {
      await mkdir(join(root, ".state"), { recursive: true });
      await writeFile(join(root, ".state", "sequenced"), "not a directory");
      await expect(openPosixDriver({ root })).rejects.toThrow(/ENOTDIR/);
    }));
});
