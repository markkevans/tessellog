import { toHex } from "@tessellog/core";
import type { FollowedEntry } from "./antispam-store.js";

export type IdentityIndex = {
  readonly lookup: (identity: Uint8Array) => bigint | undefined;
  readonly remember: (entries: readonly FollowedEntry[]) => void;
};

export const createIdentityIndex = (): IdentityIndex => {
  const indices = new Map<string, bigint>();
  return {
    lookup: (identity) => indices.get(toHex(identity)),
    remember: (entries) => {
      entries
        .map(({ identity, index }) => ({ key: toHex(identity), index }))
        .filter(({ key }) => !indices.has(key))
        .forEach(({ key, index }) => indices.set(key, index));
    },
  };
};
