import { toHex } from "@tessellog/core";
import type { AntispamStore } from "./antispam-store.js";

export const createMemoryAntispamStore = (): AntispamStore => {
  const indices = new Map<string, bigint>();
  let followed = 0n;
  return {
    lookup: async (identity) => indices.get(toHex(identity)),
    followedSize: async () => followed,
    record: async (entries, followedSize) => {
      entries
        .map(({ identity, index }) => ({ key: toHex(identity), index }))
        .filter(({ key }) => !indices.has(key))
        .forEach(({ key, index }) => indices.set(key, index));
      followed = followedSize;
    },
  };
};
