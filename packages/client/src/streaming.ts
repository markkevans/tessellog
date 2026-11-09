import {
  TILE_WIDTH,
  TILE_WIDTH_BIGINT as WIDTH,
  type BundleAddress,
  type Checkpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { proveInclusionWith } from "./inclusion.js";
import type { ClientLayout } from "./layouts.js";
import { withTileCache } from "./tile-cache.js";

export type StreamedEntry = {
  readonly index: bigint;
  readonly entry: Uint8Array;
};

export type EntryRange = {
  readonly checkpoint: Checkpoint;
  readonly from?: bigint;
  readonly to?: bigint;
};

const bundleAddress = (index: bigint, size: bigint): BundleAddress => ({
  index,
  width: index < size / WIDTH ? TILE_WIDTH : Number(size % WIDTH),
});

const bundleIndices = (from: bigint, to: bigint): readonly bigint[] =>
  from >= to
    ? []
    : Array.from({ length: Number((to - 1n) / WIDTH - from / WIDTH + 1n) }, (_, i) => from / WIDTH + BigInt(i));

const readBundle = async (
  fetcher: LogFetcher,
  layout: ClientLayout,
  address: BundleAddress,
): Promise<Result<readonly Uint8Array[]>> => {
  const bytes = await fetcher.readEntryBundle(address);
  if (bytes === undefined) {
    return { ok: false, error: `missing entry bundle ${layout.entriesPath(address)}` };
  }
  const decoded = layout.decodeBundle(bytes, address.index * WIDTH);
  return decoded.ok
    ? decoded
    : { ok: false, error: `corrupt entry bundle ${layout.entriesPath(address)}: ${decoded.error}` };
};

export async function* streamEntries(
  fetcher: LogFetcher,
  layout: ClientLayout,
  { checkpoint, from = 0n, to = checkpoint.size }: EntryRange,
): AsyncGenerator<Result<StreamedEntry>> {
  if (to > checkpoint.size) {
    yield { ok: false, error: `range [${from}, ${to}) is outside a checkpoint of size ${checkpoint.size}` };
    return;
  }
  const cached = withTileCache(fetcher);
  const prove = proveInclusionWith(cached, layout);
  for (const bundleIndex of bundleIndices(from, to)) {
    const bundle = await readBundle(cached, layout, bundleAddress(bundleIndex, checkpoint.size));
    if (!bundle.ok) {
      yield bundle;
      return;
    }
    const first = bundleIndex * WIDTH;
    const wanted = bundle.value
      .map((entry, i) => ({ index: first + BigInt(i), entry }))
      .filter(({ index }) => index >= from && index < to);
    for (const streamed of wanted) {
      const proven = await prove({ ...streamed, checkpoint });
      if (!proven.ok) {
        yield { ok: false, error: `entry ${streamed.index}: ${proven.error}` };
        return;
      }
      yield { ok: true, value: streamed };
    }
  }
}
