import type { EntryLayout } from "@tessellog/appender";
import { entriesPath, type BundleAddress } from "@tessellog/core";
import { ctIdentity, decodeTileLeaves, encodeTileLeaf, merkleTreeLeafHash, type CtEntry } from "./entries.js";

const STATIC_CT_MAX_ENTRY_BYTES = 256 * 1024;

export const staticCtEntriesPath = (address: BundleAddress): string =>
  entriesPath(address).replace(/^tile\/entries\//, "tile/data/");

export const encodeCtSubmission = (entry: CtEntry): Uint8Array => encodeTileLeaf(entry, 0n);

const problemWith = (submission: Uint8Array): string | undefined => {
  const parsed = decodeTileLeaves(submission);
  if (!parsed.ok) {
    return `invalid static-CT submission: ${parsed.error}`;
  }
  return parsed.value.length === 1 ? undefined : "invalid static-CT submission: expected exactly one TileLeaf";
};

const entryOf = (submission: Uint8Array): CtEntry => {
  const parsed = decodeTileLeaves(submission);
  const [first, ...rest] = parsed.ok ? parsed.value : [];
  if (first === undefined || rest.length > 0) {
    throw new Error("invalid static-CT submission");
  }
  return first.entry;
};

export const staticCtLayout: EntryLayout = {
  maxEntryBytes: STATIC_CT_MAX_ENTRY_BYTES,
  entriesPath: staticCtEntriesPath,
  leafHash: (submission, index) => merkleTreeLeafHash(entryOf(submission), index),
  encodeEntry: (submission, index) => encodeTileLeaf(entryOf(submission), index),
  decodeBundle: (bundle, firstIndex) => {
    const parsed = decodeTileLeaves(bundle);
    if (!parsed.ok) {
      return parsed;
    }
    const misplaced = parsed.value.findIndex(({ index }, i) => index !== firstIndex + BigInt(i));
    const leaf = parsed.value[misplaced];
    return leaf === undefined
      ? { ok: true, value: parsed.value.map(({ entry }) => encodeCtSubmission(entry)) }
      : { ok: false, error: `TileLeaf ${misplaced} carries leaf index ${leaf.index}, want ${firstIndex + BigInt(misplaced)}` };
  },
  identity: (submission) => ctIdentity(entryOf(submission)),
  validateEntry: problemWith,
};
