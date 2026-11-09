import { concatBytes } from "@noble/hashes/utils";
import { TILE_WIDTH, TILE_WIDTH_BIGINT as WIDTH } from "@tessellog/core";
import type { BundleAddress, EntryBundle } from "./driver.js";
import type { EntryLayout } from "./layout.js";

export type BundleReader = (address: BundleAddress) => Promise<Uint8Array | undefined>;

export const decodeStoredBundle = (
  layout: EntryLayout,
  address: BundleAddress,
  stored: Uint8Array | undefined,
): readonly Uint8Array[] => {
  if (stored === undefined) {
    throw new Error(`missing entry bundle ${layout.entriesPath(address)}`);
  }
  const decoded = layout.decodeBundle(stored, address.index * WIDTH);
  if (!decoded.ok) {
    throw new Error(`corrupt entry bundle ${layout.entriesPath(address)}: ${decoded.error}`);
  }
  return decoded.value;
};

export const readBundleEntries = async (
  layout: EntryLayout,
  readBundle: BundleReader,
  address: BundleAddress,
): Promise<readonly Uint8Array[]> => decodeStoredBundle(layout, address, await readBundle(address));

const readPartialBundle = async (
  layout: EntryLayout,
  fromSize: bigint,
  readBundle: BundleReader,
): Promise<readonly Uint8Array[]> => {
  const address = { index: fromSize / WIDTH, width: Number(fromSize % WIDTH) };
  return address.width === 0 ? [] : readBundleEntries(layout, readBundle, address);
};

export const bundleEntries = async ({
  layout,
  fromSize,
  entries,
  readBundle,
}: {
  readonly layout: EntryLayout;
  readonly fromSize: bigint;
  readonly entries: readonly Uint8Array[];
  readonly readBundle: BundleReader;
}): Promise<readonly EntryBundle[]> => {
  const combined = [...(await readPartialBundle(layout, fromSize, readBundle)), ...entries];
  const firstBundle = fromSize / WIDTH;
  return Array.from({ length: Math.ceil(combined.length / TILE_WIDTH) }, (_, i) => {
    const group = combined.slice(i * TILE_WIDTH, (i + 1) * TILE_WIDTH);
    const first = (firstBundle + BigInt(i)) * WIDTH;
    return {
      index: firstBundle + BigInt(i),
      width: group.length,
      data: concatBytes(...group.map((entry, offset) => layout.encodeEntry(entry, first + BigInt(offset)))),
    };
  });
};
