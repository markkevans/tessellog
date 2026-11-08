import { decodeBundle, encodeBundle, entriesPath, TILE_WIDTH } from "@tessellog/core";
import type { BundleAddress, EntryBundle } from "./driver.js";

const WIDTH = BigInt(TILE_WIDTH);

type BundleReader = (address: BundleAddress) => Promise<Uint8Array | undefined>;

const readPartialBundle = async (
  fromSize: bigint,
  readBundle: BundleReader,
): Promise<readonly Uint8Array[]> => {
  const address = { index: fromSize / WIDTH, width: Number(fromSize % WIDTH) };
  if (address.width === 0) {
    return [];
  }
  const stored = await readBundle(address);
  if (stored === undefined) {
    throw new Error(`missing entry bundle ${entriesPath(address)}`);
  }
  const decoded = decodeBundle(stored);
  if (!decoded.ok) {
    throw new Error(`corrupt entry bundle ${entriesPath(address)}: ${decoded.error}`);
  }
  return decoded.value;
};

export const bundleEntries = async ({
  fromSize,
  entries,
  readBundle,
}: {
  readonly fromSize: bigint;
  readonly entries: readonly Uint8Array[];
  readonly readBundle: BundleReader;
}): Promise<readonly EntryBundle[]> => {
  const combined = [...(await readPartialBundle(fromSize, readBundle)), ...entries];
  const firstBundle = fromSize / WIDTH;
  return Array.from({ length: Math.ceil(combined.length / TILE_WIDTH) }, (_, i) => {
    const group = combined.slice(i * TILE_WIDTH, (i + 1) * TILE_WIDTH);
    return { index: firstBundle + BigInt(i), width: group.length, data: encodeBundle(group) };
  });
};
