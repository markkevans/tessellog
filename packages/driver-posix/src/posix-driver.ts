import { mkdir } from "node:fs/promises";
import type { LogDriver, TreeState } from "@tessellog/appender";
import { entriesPath, tilePath } from "@tessellog/core";
import { logFiles } from "./files.js";
import { lockDirectory } from "./lock.js";
import {
  readBatches,
  readTreeState,
  writeBatch,
  writeTreeState,
  type SequencedBatch,
} from "./state.js";

const CHECKPOINT_PATH = "checkpoint";

export type PosixDriver = LogDriver & {
  readonly close: () => Promise<void>;
};

export const openPosixDriver = async ({ root }: { readonly root: string }): Promise<PosixDriver> => {
  await mkdir(root, { recursive: true });
  const lock = await lockDirectory(root);
  const files = logFiles(root);
  const [storedBatches, storedTreeState] = await Promise.all([
    readBatches(files),
    readTreeState(files),
  ]).catch(async (error: unknown) => {
    await lock.release();
    throw error;
  });
  let batches: readonly SequencedBatch[] = storedBatches;
  let treeState: TreeState = storedTreeState;
  const nextIndex = (): bigint => {
    const last = batches.at(-1);
    return last === undefined ? 0n : last.firstIndex + BigInt(last.entries.length);
  };
  return {
    sequence: async (entries) => {
      const batch = { firstIndex: nextIndex(), entries };
      await writeBatch(files, batch);
      batches = [...batches, batch];
      return batch.firstIndex;
    },
    readSequenced: async (fromIndex) =>
      batches
        .flatMap(({ firstIndex, entries }) =>
          entries.map((entry, i) => ({ index: firstIndex + BigInt(i), entry })),
        )
        .filter(({ index }) => index >= fromIndex)
        .map(({ entry }) => entry),
    readTreeState: async () => treeState,
    readTile: (address) => files.read(tilePath(address)),
    readEntryBundle: (address) => files.read(entriesPath(address)),
    writeIntegration: async ({ size, rootHash: root, tiles, bundles }) => {
      await Promise.all([
        ...tiles.map((tile) => files.write(tilePath(tile), tile.hashes)),
        ...bundles.map((bundle) => files.write(entriesPath(bundle), bundle.data)),
      ]);
      treeState = { size, rootHash: root };
      await writeTreeState(files, treeState);
    },
    readCheckpoint: () => files.read(CHECKPOINT_PATH),
    writeCheckpoint: (checkpoint) => files.write(CHECKPOINT_PATH, checkpoint),
    close: () => lock.release(),
  };
};
