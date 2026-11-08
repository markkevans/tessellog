import { mkdir, open, rm } from "node:fs/promises";
import { join } from "node:path";

const STATE_DIRECTORY = ".state";
const LOCK_FILE = "lock";

export type DirectoryLock = {
  readonly release: () => Promise<void>;
};

export const lockDirectory = async (root: string): Promise<DirectoryLock> => {
  await mkdir(join(root, STATE_DIRECTORY), { recursive: true });
  const lockPath = join(root, STATE_DIRECTORY, LOCK_FILE);
  const handle = await open(lockPath, "wx").catch((error: unknown) => {
    throw new Error(
      `cannot lock log directory ${root}: remove ${lockPath} if no writer is running`,
      { cause: error },
    );
  });
  await handle.writeFile(`${process.pid}\n`);
  await handle.close();
  return {
    release: () => rm(lockPath, { force: true }),
  };
};
