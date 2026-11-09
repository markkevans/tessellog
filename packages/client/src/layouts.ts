import {
  decodeBundle,
  encodeBundle,
  entriesPath,
  leafHash,
  type BundleAddress,
  type Result,
} from "@tessellog/core";

export type BundleLayout = {
  readonly entriesPath: (address: BundleAddress) => string;
  readonly decodeBundle: (bundle: Uint8Array, firstIndex: bigint) => Result<readonly Uint8Array[]>;
  readonly encodeEntry: (entry: Uint8Array, index: bigint) => Uint8Array;
};

export type ClientLayout = BundleLayout & {
  readonly leafHash: (entry: Uint8Array, index: bigint) => Uint8Array;
};

export const tlogTilesClientLayout: ClientLayout = {
  entriesPath: (address) => entriesPath(address),
  decodeBundle: (bundle) => decodeBundle(bundle),
  encodeEntry: (entry) => encodeBundle([entry]),
  leafHash: (entry) => leafHash(entry),
};
