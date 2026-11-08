import { mkdir } from "node:fs/promises";
import type { LogDriver, TreeState } from "@tessellog/appender";
import { entriesPath, rootHash, tilePath } from "@tessellog/core";
import { logFiles } from "./files.js";

const CHECKPOINT_PATH = "checkpoint";

export type PosixDriver = LogDriver & {
  readonly close: () => Promise<void>;
};

export const openPosixDriver = async ({ root }: { readonly root: string }): Promise<PosixDriver> => {
  await mkdir(root, { recursive: true });
  const files = logFiles(root);
  let sequenced: readonly Uint8Array[] = [];
  let treeState: TreeState = { size: 0n, rootHash: rootHash([]) };
  return {
    sequence: async (entries) => {
      const firstIndex = BigInt(sequenced.length);
      sequenced = [...sequenced, ...entries];
      return firstIndex;
    },
    readSequenced: async (fromIndex) => sequenced.slice(Number(fromIndex)),
    readTreeState: async () => treeState,
    readTile: (address) => files.read(tilePath(address)),
    readEntryBundle: (address) => files.read(entriesPath(address)),
    writeIntegration: async ({ size, rootHash: root, tiles, bundles }) => {
      await Promise.all([
        ...tiles.map((tile) => files.write(tilePath(tile), tile.hashes)),
        ...bundles.map((bundle) => files.write(entriesPath(bundle), bundle.data)),
      ]);
      treeState = { size, rootHash: root };
    },
    readCheckpoint: () => files.read(CHECKPOINT_PATH),
    writeCheckpoint: (checkpoint) => files.write(CHECKPOINT_PATH, checkpoint),
    close: async () => undefined,
  };
};
