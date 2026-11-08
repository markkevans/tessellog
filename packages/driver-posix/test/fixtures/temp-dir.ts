import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const makeTempDir = (): Promise<string> => mkdtemp(join(tmpdir(), "tessellog-posix-"));

export const removeDir = (dir: string): Promise<void> => rm(dir, { recursive: true, force: true });

export const allFiles = async (dir: string): Promise<readonly string[]> =>
  (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();
