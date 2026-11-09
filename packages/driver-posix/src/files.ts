import { randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

export type LogFiles = {
  readonly read: (relativePath: string) => Promise<Uint8Array | undefined>;
  readonly readExisting: (relativePath: string) => Promise<Uint8Array>;
  readonly write: (relativePath: string, data: Uint8Array) => Promise<void>;
  readonly list: (relativeDirectory: string) => Promise<readonly string[]>;
  readonly remove: (relativePath: string) => Promise<void>;
};

export const logFiles = (root: string): LogFiles => ({
  read: async (relativePath) => {
    try {
      return new Uint8Array(await readFile(join(root, relativePath)));
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  },
  readExisting: async (relativePath) => new Uint8Array(await readFile(join(root, relativePath))),
  write: async (relativePath, data) => {
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${randomUUID()}`;
    const handle = await open(temporary, "w");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
  },
  remove: (relativePath) => rm(join(root, relativePath), { recursive: true, force: true }),
  list: async (relativeDirectory) => {
    try {
      return (await readdir(join(root, relativeDirectory)))
        .filter((name) => !name.includes(".tmp-"))
        .sort();
    } catch (error) {
      if (isNotFound(error)) {
        return [];
      }
      throw error;
    }
  },
});
