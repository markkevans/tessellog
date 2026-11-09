import { sha256 } from "@noble/hashes/sha2";
import { decodeBundle, encodeBundle, entriesPath, leafHash, type BundleAddress, type Result } from "@tessellog/core";

export type EntryLayout = {
  readonly maxEntryBytes: number;
  readonly entriesPath: (address: BundleAddress) => string;
  readonly leafHash: (entry: Uint8Array, index: bigint) => Uint8Array;
  readonly encodeEntry: (entry: Uint8Array, index: bigint) => Uint8Array;
  readonly decodeBundle: (bundle: Uint8Array, firstIndex: bigint) => Result<readonly Uint8Array[]>;
  readonly identity: (entry: Uint8Array) => Uint8Array;
  readonly validateEntry: (entry: Uint8Array) => string | undefined;
};

export const tlogTilesLayout: EntryLayout = {
  maxEntryBytes: 65_535,
  entriesPath: (address) => entriesPath(address),
  leafHash: (entry) => leafHash(entry),
  encodeEntry: (entry) => encodeBundle([entry]),
  decodeBundle: (bundle) => decodeBundle(bundle),
  identity: (entry) => sha256(entry),
  validateEntry: () => undefined,
};
