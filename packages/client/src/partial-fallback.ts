import { concatBytes } from "@noble/hashes/utils";
import {
  HASH_BYTES,
  TILE_WIDTH,
  TILE_WIDTH_BIGINT as WIDTH,
  type BundleAddress,
  type TileAddress,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { tlogTilesClientLayout, type BundleLayout } from "./layouts.js";

const isPartial = ({ width }: { readonly width: number }): boolean => width < TILE_WIDTH;

const firstHashes = (tile: Uint8Array | undefined, width: number): Uint8Array | undefined =>
  tile?.slice(0, width * HASH_BYTES);

const firstEntries = (
  layout: BundleLayout,
  address: BundleAddress,
  bundle: Uint8Array | undefined,
): Uint8Array | undefined => {
  if (bundle === undefined) {
    return undefined;
  }
  const first = address.index * WIDTH;
  const decoded = layout.decodeBundle(bundle, first);
  if (!decoded.ok) {
    throw new Error(
      `corrupt entry bundle ${layout.entriesPath({ index: address.index, width: TILE_WIDTH })}: ${decoded.error}`,
    );
  }
  return concatBytes(
    ...decoded.value.slice(0, address.width).map((entry, i) => layout.encodeEntry(entry, first + BigInt(i))),
  );
};

export const withFullTileFallback = (
  fetcher: LogFetcher,
  layout: BundleLayout = tlogTilesClientLayout,
): LogFetcher => ({
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
      : firstEntries(layout, address, await fetcher.readEntryBundle({ ...address, width: TILE_WIDTH }));
  },
});
