import { sha256 } from "@noble/hashes/sha2";
import { toHex } from "@tessellog/core";
import type { AddResult } from "./batching.js";

export type Add = (entry: Uint8Array) => Promise<AddResult>;

export type Deduplicate = (entry: Uint8Array, add: Add) => Promise<AddResult>;

export const identityOf = (entry: Uint8Array): string => toHex(sha256(entry));

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
