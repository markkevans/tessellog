import { entriesPath, rootHash, tilePath } from "@tessellog/core";
import type { LogDriver, TreeState } from "./driver.js";

export const createMemoryDriver = (): LogDriver => {
  let sequenced: readonly Uint8Array[] = [];
  let treeState: TreeState = { size: 0n, rootHash: rootHash([]) };
  let objects: ReadonlyMap<string, Uint8Array> = new Map();
  return {
    sequence: async (entries) => {
      const firstIndex = BigInt(sequenced.length);
      sequenced = [...sequenced, ...entries];
      return firstIndex;
    },
    readSequenced: async (fromIndex) => sequenced.slice(Number(fromIndex)),
    readTreeState: async () => treeState,
    readTile: async (address) => objects.get(tilePath(address)),
    readEntryBundle: async (address) => objects.get(entriesPath(address)),
    writeIntegration: async ({ size, rootHash: root, tiles, bundles }) => {
      objects = new Map([
        ...objects,
        ...tiles.map((tile) => [tilePath(tile), tile.hashes] as const),
        ...bundles.map((bundle) => [entriesPath(bundle), bundle.data] as const),
      ]);
      treeState = { size, rootHash: root };
    },
  };
};
