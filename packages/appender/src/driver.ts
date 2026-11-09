import type { BundleAddress, Tile, TileAddress } from "@tessellog/core";

export type { BundleAddress } from "@tessellog/core";

export type EntryBundle = BundleAddress & { readonly data: Uint8Array };

export type IntegrationUpdate = {
  readonly size: bigint;
  readonly rootHash: Uint8Array;
  readonly tiles: readonly Tile[];
  readonly bundles: readonly EntryBundle[];
};

export type TreeState = {
  readonly size: bigint;
  readonly rootHash: Uint8Array;
};

export interface LogDriver {
  sequence(entries: readonly Uint8Array[]): Promise<bigint>;
  readSequenced(fromIndex: bigint): Promise<readonly Uint8Array[]>;
  readTreeState(): Promise<TreeState>;
  readTile(address: TileAddress): Promise<Uint8Array | undefined>;
  readEntryBundle(address: BundleAddress): Promise<Uint8Array | undefined>;
  writeIntegration(update: IntegrationUpdate): Promise<void>;
  readCheckpoint(): Promise<Uint8Array | undefined>;
  writeCheckpoint(checkpoint: Uint8Array): Promise<void>;
  collectGarbage(upToSize: bigint): Promise<void>;
}
