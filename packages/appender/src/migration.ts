import {
  TILE_WIDTH,
  TILE_WIDTH_BIGINT as WIDTH,
  toHex,
  type BundleAddress,
  type Result,
} from "@tessellog/core";
import type { AntispamStore } from "./antispam-store.js";
import { decodeStoredBundle, type BundleReader } from "./bundling.js";
import type { LogDriver } from "./driver.js";
import { followOutstanding } from "./follower.js";
import { integrateOutstanding } from "./integrator.js";
import { tlogTilesLayout, type EntryLayout } from "./layout.js";

export type MigrationSource = {
  readonly readEntryBundle: BundleReader;
  readonly sourceSize: bigint;
  readonly sourceRoot: Uint8Array;
};

export type MigrationTarget = {
  readonly migrate: (source: MigrationSource) => Promise<Result<void>>;
};

const sourceEntries = async (
  layout: EntryLayout,
  read: BundleReader,
  address: BundleAddress,
): Promise<readonly Uint8Array[]> => {
  const exact = await read(address);
  const stored = exact ?? (await read({ ...address, width: TILE_WIDTH }));
  return decodeStoredBundle(layout, address, stored).slice(0, address.width);
};

const bundlesBetween = (from: bigint, to: bigint): readonly bigint[] =>
  from >= to
    ? []
    : Array.from({ length: Number((to - 1n) / WIDTH - from / WIDTH + 1n) }, (_, i) => from / WIDTH + BigInt(i));

const copyBundle = async (
  driver: LogDriver,
  layout: EntryLayout,
  { readEntryBundle, sourceSize }: MigrationSource,
  bundleIndex: bigint,
): Promise<void> => {
  const width = bundleIndex < sourceSize / WIDTH ? TILE_WIDTH : Number(sourceSize % WIDTH);
  const entries = await sourceEntries(layout, readEntryBundle, { index: bundleIndex, width });
  const { size } = await driver.readTreeState();
  await driver.sequence(entries.slice(Number(size - bundleIndex * WIDTH)));
  await integrateOutstanding(driver, layout);
};

export const createMigrationTarget = ({
  driver,
  antispam,
}: {
  readonly driver: LogDriver;
  readonly antispam?: AntispamStore;
}): MigrationTarget => ({
  migrate: (source) =>
    (async (): Promise<Result<void>> => {
      const layout = tlogTilesLayout;
      await integrateOutstanding(driver, layout);
      const { size: from } = await driver.readTreeState();
      await bundlesBetween(from, source.sourceSize).reduce<Promise<void>>(async (previous, bundleIndex) => {
        await previous;
        await copyBundle(driver, layout, source, bundleIndex);
      }, Promise.resolve());
      await (antispam === undefined ? Promise.resolve() : followOutstanding(driver, layout, antispam));
      const { size, rootHash } = await driver.readTreeState();
      return size === source.sourceSize && toHex(rootHash) === toHex(source.sourceRoot)
        ? { ok: true, value: undefined }
        : { ok: false, error: `migrated root does not match the source root at size ${source.sourceSize}` };
    })().catch((error: Error): Result<void> => ({ ok: false, error: error.message })),
});
