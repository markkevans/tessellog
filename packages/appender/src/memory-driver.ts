import {
  entriesPath as tlogEntriesPath,
  partialPathsOf,
  rootHash,
  tilePath,
  tilesFilledBetween,
  type BundleAddress,
} from "@tessellog/core";
import type { LogDriver, TreeState } from "./driver.js";

export const createMemoryDriver = ({
  entriesPath = tlogEntriesPath,
}: { readonly entriesPath?: (address: BundleAddress) => string } = {}): LogDriver => {
  let sequenced: readonly Uint8Array[] = [];
  let treeState: TreeState = { size: 0n, rootHash: rootHash([]) };
  let objects: ReadonlyMap<string, Uint8Array> = new Map();
  let checkpoint: Uint8Array | undefined;
  let retainedFrom = 0n;
  let collected = 0n;
  return {
    sequence: async (entries) => {
      const firstIndex = retainedFrom + BigInt(sequenced.length);
      sequenced = [...sequenced, ...entries];
      return firstIndex;
    },
    readSequenced: async (fromIndex) => sequenced.slice(Number(fromIndex - retainedFrom)),
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
    readCheckpoint: async () => checkpoint,
    writeCheckpoint: async (signed) => {
      checkpoint = signed;
    },
    collectGarbage: async (upToSize) => {
      const obsolete = new Set(partialPathsOf(tilesFilledBetween({ fromSize: collected, toSize: upToSize })));
      objects = new Map([...objects].filter(([path]) => !obsolete.has(path)));
      sequenced = sequenced.slice(Number(upToSize - retainedFrom));
      retainedFrom = upToSize;
      collected = upToSize;
    },
  };
};
