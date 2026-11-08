import type { BundleAddress, TileAddress } from "@tessellog/core";

export type LogFetcher = {
  readonly readCheckpoint: () => Promise<Uint8Array | undefined>;
  readonly readTile: (address: TileAddress) => Promise<Uint8Array | undefined>;
  readonly readEntryBundle: (address: BundleAddress) => Promise<Uint8Array | undefined>;
};
