import { concatBytes } from "@noble/hashes/utils";
import {
  rootFromTilesAndLeaves,
  TILE_WIDTH,
  TILE_WIDTH_BIGINT as WIDTH,
  tilePath,
  type BundleAddress,
  type Checkpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { proveInclusionWith } from "./inclusion.js";
import type { ClientLayout } from "./layouts.js";
import { withTileCache } from "./tile-cache.js";
import { failureFrom, requireTile } from "./tiles.js";

export type StreamedEntry = {
  readonly index: bigint;
  readonly entry: Uint8Array;
};

export type EntryRange = {
  readonly checkpoint: Checkpoint;
  readonly from?: bigint;
  readonly to?: bigint;
};

type BundleCheck = {
  readonly fetcher: LogFetcher;
  readonly cached: LogFetcher;
  readonly layout: ClientLayout;
  readonly checkpoint: Checkpoint;
  readonly address: BundleAddress;
  readonly entries: readonly StreamedEntry[];
};

const bundleAddress = (index: bigint, size: bigint): BundleAddress => ({
  index,
  width: index < size / WIDTH ? TILE_WIDTH : Number(size % WIDTH),
});

const bundleIndices = (from: bigint, to: bigint): readonly bigint[] =>
  from >= to
    ? []
    : Array.from({ length: Number((to - 1n) / WIDTH - from / WIDTH + 1n) }, (_, i) => from / WIDTH + BigInt(i));

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((byte, i) => byte === b[i]);

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
  if (!decoded.ok) {
    return { ok: false, error: `corrupt entry bundle ${layout.entriesPath(address)}: ${decoded.error}` };
  }
  return decoded.value.length === address.width
    ? decoded
    : {
        ok: false,
        error: `entry bundle ${layout.entriesPath(address)} holds ${decoded.value.length} entries, want ${address.width}`,
      };
};

const checkBundle = async ({ fetcher, cached, layout, checkpoint, address, entries }: BundleCheck): Promise<Result<void>> => {
  const readTile = requireTile(cached);
  const readOwnTile = address.width === TILE_WIDTH ? requireTile(fetcher) : readTile;
  const tileAddress = { level: 0, index: address.index, width: address.width };
  const leafHashes = entries.map(({ entry, index }) => layout.leafHash(entry, index));
  const compared = async (): Promise<Result<void>> => {
    if (!sameBytes(await readOwnTile(tileAddress), concatBytes(...leafHashes))) {
      return {
        ok: false,
        error: `entry bundle ${layout.entriesPath(address)} does not match tile ${tilePath(tileAddress)}`,
      };
    }
    const root = await rootFromTilesAndLeaves({
      treeSize: checkpoint.size,
      start: address.index * WIDTH,
      leafHashes,
      readTile,
    });
    return sameBytes(root, checkpoint.rootHash)
      ? { ok: true, value: undefined }
      : { ok: false, error: `entry bundle ${layout.entriesPath(address)} does not match the checkpoint` };
  };
  return compared().catch(failureFrom);
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
  const inRange = ({ index }: StreamedEntry): boolean => index >= from && index < to;
  for (const bundleIndex of bundleIndices(from, to)) {
    const address = bundleAddress(bundleIndex, checkpoint.size);
    const bundle = await readBundle(cached, layout, address);
    if (!bundle.ok) {
      yield bundle;
      return;
    }
    const first = bundleIndex * WIDTH;
    const entries = bundle.value.map((entry, i) => ({ index: first + BigInt(i), entry }));
    const checked = await checkBundle({ fetcher, cached, layout, checkpoint, address, entries });
    if (checked.ok) {
      yield* entries.filter(inRange).map((value): Result<StreamedEntry> => ({ ok: true, value }));
      continue;
    }
    for (const streamed of entries) {
      const proven = await prove({ ...streamed, checkpoint });
      if (!proven.ok) {
        yield { ok: false, error: `entry ${streamed.index}: ${proven.error}` };
        return;
      }
      if (inRange(streamed)) {
        yield { ok: true, value: streamed };
      }
    }
    yield { ok: false, error: checked.error };
    return;
  }
}
