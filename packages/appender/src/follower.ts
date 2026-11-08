import { sha256 } from "@noble/hashes/sha2";
import { TILE_WIDTH, TILE_WIDTH_BIGINT as WIDTH } from "@tessellog/core";
import type { AntispamStore } from "./antispam-store.js";
import { readBundleEntries } from "./bundling.js";
import type { LogDriver } from "./driver.js";
import { serialTasks } from "./serial-tasks.js";

export type Follower = {
  readonly schedule: () => void;
  readonly idle: () => Promise<void>;
};

export const noFollower: Follower = {
  schedule: () => undefined,
  idle: async () => undefined,
};

const bundlesBetween = (from: bigint, to: bigint): readonly bigint[] =>
  from >= to
    ? []
    : Array.from({ length: Number((to - 1n) / WIDTH - from / WIDTH + 1n) }, (_, i) => from / WIDTH + BigInt(i));

const followBundle = async (
  driver: LogDriver,
  store: AntispamStore,
  bundleIndex: bigint,
  { from, size }: { readonly from: bigint; readonly size: bigint },
): Promise<void> => {
  const width = bundleIndex < size / WIDTH ? TILE_WIDTH : Number(size % WIDTH);
  const entries = await readBundleEntries((address) => driver.readEntryBundle(address), {
    index: bundleIndex,
    width,
  });
  const first = bundleIndex * WIDTH;
  const followed = entries
    .map((entry, i) => ({ identity: sha256(entry), index: first + BigInt(i) }))
    .filter(({ index }) => index >= from);
  await store.record(followed, first + BigInt(entries.length));
};

const followOutstanding = async (driver: LogDriver, store: AntispamStore): Promise<void> => {
  const from = await store.followedSize();
  const { size } = await driver.readTreeState();
  await bundlesBetween(from, size).reduce<Promise<void>>(async (previous, bundleIndex) => {
    await previous;
    await followBundle(driver, store, bundleIndex, { from, size });
  }, Promise.resolve());
};

export const createFollower = ({
  driver,
  store,
  onError,
}: {
  readonly driver: LogDriver;
  readonly store: AntispamStore;
  readonly onError: (error: unknown) => void;
}): Follower => {
  const tasks = serialTasks(onError);
  return {
    schedule: () => {
      tasks.run(() => followOutstanding(driver, store));
    },
    idle: () => tasks.idle(),
  };
};
