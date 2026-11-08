import {
  decodeBundle,
  encodeBundle,
  entriesPath,
  TILE_WIDTH,
  type BundleAddress,
  type TileAddress,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";

const HASH_BYTES = 32;

const isPartial = ({ width }: { readonly width: number }): boolean => width < TILE_WIDTH;

const firstHashes = (tile: Uint8Array | undefined, width: number): Uint8Array | undefined =>
  tile?.slice(0, width * HASH_BYTES);

const firstEntries = (
  address: BundleAddress,
  bundle: Uint8Array | undefined,
): Uint8Array | undefined => {
  if (bundle === undefined) {
    return undefined;
  }
  const decoded = decodeBundle(bundle);
  if (!decoded.ok) {
    throw new Error(`corrupt entry bundle ${entriesPath({ index: address.index })}: ${decoded.error}`);
  }
  return encodeBundle(decoded.value.slice(0, address.width));
};

export const withFullTileFallback = (fetcher: LogFetcher): LogFetcher => ({
  readCheckpoint: () => fetcher.readCheckpoint(),
  readTile: async (address: TileAddress) => {
    const tile = await fetcher.readTile(address);
    return tile !== undefined || !isPartial(address)
      ? tile
      : firstHashes(await fetcher.readTile({ ...address, width: TILE_WIDTH }), address.width);
  },
  readEntryBundle: async (address: BundleAddress) => {
    const bundle = await fetcher.readEntryBundle(address);
    return bundle !== undefined || !isPartial(address)
      ? bundle
      : firstEntries(address, await fetcher.readEntryBundle({ ...address, width: TILE_WIDTH }));
  },
});
