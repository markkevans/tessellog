import { sha256 } from "@noble/hashes/sha2";
import { toHex } from "@tessellog/core";
import type { AntispamStore } from "./antispam-store.js";
import type { AddResult } from "./batching.js";
import { PushbackAntispamError } from "./errors.js";

export type Add = (entry: Uint8Array) => Promise<AddResult>;

export type Deduplicate = (entry: Uint8Array, add: Add) => Promise<AddResult>;

const identityOf = (entry: Uint8Array): string => toHex(sha256(entry));

export const withoutDeduplication: Deduplicate = (entry, add) => add(entry);

export const inMemoryDeduplication = (capacity: number): Deduplicate => {
  const recent = new Map<string, Promise<AddResult>>();
  const remember = (identity: string, result: Promise<AddResult>): void => {
    recent.delete(identity);
    recent.set(identity, result);
    if (recent.size > capacity) {
      for (const oldest of recent.keys()) {
        recent.delete(oldest);
        break;
      }
    }
  };
  return (entry, add) => {
    const identity = identityOf(entry);
    const previous = recent.get(identity);
    if (previous !== undefined) {
      remember(identity, previous);
      return previous.then((result) => ({ ...result, isDup: true }));
    }
    const result = add(entry);
    remember(identity, result);
    result.catch(() => recent.delete(identity));
    return result;
  };
};

export const persistentDeduplication =
  ({
    store,
    integratedSize,
    pushbackThreshold,
  }: {
    readonly store: AntispamStore;
    readonly integratedSize: () => Promise<bigint>;
    readonly pushbackThreshold: number;
  }): Deduplicate =>
  async (entry, add) => {
    if ((await integratedSize()) - (await store.followedSize()) > BigInt(pushbackThreshold)) {
      throw new PushbackAntispamError();
    }
    const index = await store.lookup(sha256(entry));
    return index === undefined ? add(entry) : { index, isDup: true };
  };

export const layered =
  (outer: Deduplicate, inner: Deduplicate): Deduplicate =>
  (entry, add) =>
    outer(entry, (unique) => inner(unique, add));
