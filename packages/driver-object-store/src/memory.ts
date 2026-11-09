import type { TreeState } from "@tessellog/appender";
import { rootHash } from "@tessellog/core";
import type { Coordinator, ObjectStore } from "./contracts.js";

export const createMemoryObjectStore = (): ObjectStore => {
  const objects = new Map<string, Uint8Array>();
  return {
    get: async (key) => objects.get(key),
    put: async (key, data) => {
      objects.set(key, data);
    },
    delete: async (key) => {
      objects.delete(key);
    },
  };
};

export const createMemoryCoordinator = (): Coordinator => {
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
    advanceTreeState: async (expectedSize, next) => {
      if (treeState.size !== expectedSize) {
        return false;
      }
      treeState = next;
      return true;
    },
  };
};
