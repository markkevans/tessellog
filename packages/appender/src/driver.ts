import type { Tile, TileAddress } from "@tessellog/core";

export type BundleAddress = {
  readonly index: bigint;
  readonly width: number;
};

export type EntryBundle = BundleAddress & { readonly data: Uint8Array };

export type IntegrationUpdate = {
  readonly size: bigint;
  readonly rootHash: Uint8Array;
  readonly tiles: readonly Tile[];
  readonly bundles: readonly EntryBundle[];
};

export interface LogDriver {
  sequence(entries: readonly Uint8Array[]): Promise<bigint>;
  readSequenced(fromIndex: bigint): Promise<readonly Uint8Array[]>;
  integratedSize(): Promise<bigint>;
  readTile(address: TileAddress): Promise<Uint8Array | undefined>;
  readEntryBundle(address: BundleAddress): Promise<Uint8Array | undefined>;
  writeIntegration(update: IntegrationUpdate): Promise<void>;
}
