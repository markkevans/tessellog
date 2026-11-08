import type { AntispamStore } from "./antispam-store.js";
import { createIdentityIndex } from "./identity-index.js";

export const createMemoryAntispamStore = (): AntispamStore => {
  const index = createIdentityIndex();
  let followed = 0n;
  return {
    lookup: async (identity) => index.lookup(identity),
    followedSize: async () => followed,
    record: async (entries, followedSize) => {
      index.remember(entries);
      followed = followedSize;
    },
  };
};
