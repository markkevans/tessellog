import type { WitnessedCheckpoint, WitnessStore } from "@tessellog/witness";
import { describe, expect, it } from "vitest";

export type WitnessStoreHarness = {
  readonly store: WitnessStore;
  readonly cleanup: () => Promise<void>;
};

export type WitnessStoreSetup = () => Promise<WitnessStoreHarness>;

const ORIGIN = "example.com/log";
const OTHER_ORIGIN = "example.com/other";

const checkpoint = (size: bigint): WitnessedCheckpoint => ({
  size,
  rootHash: Uint8Array.from({ length: 32 }, (_, i) => (Number(size) + i) & 0xff),
});

const withStore = async <T>(setup: WitnessStoreSetup, test: (store: WitnessStore) => Promise<T>): Promise<T> => {
  const { store, cleanup } = await setup();
  try {
    return await test(store);
  } finally {
    await cleanup();
  }
};

export const describeWitnessStore = (name: string, setup: WitnessStoreSetup): void => {
  describe(`${name} conforms to the WitnessStore contract`, () => {
    it("knows nothing about a log it has never witnessed", () =>
      withStore(setup, async (store) => {
        expect(await store.latest(ORIGIN)).toBeUndefined();
      }));

    it("records the first checkpoint of a log from size zero", () =>
      withStore(setup, async (store) => {
        expect(await store.advance(ORIGIN, 0n, checkpoint(3n))).toBe(true);
        expect(await store.latest(ORIGIN)).toEqual(checkpoint(3n));
      }));

    it("advances from the recorded size", () =>
      withStore(setup, async (store) => {
        await store.advance(ORIGIN, 0n, checkpoint(3n));
        expect(await store.advance(ORIGIN, 3n, checkpoint(9n))).toBe(true);
        expect(await store.latest(ORIGIN)).toEqual(checkpoint(9n));
      }));

    it("refuses to advance from any other size and keeps what it had", () =>
      withStore(setup, async (store) => {
        await store.advance(ORIGIN, 0n, checkpoint(3n));
        expect(await store.advance(ORIGIN, 2n, checkpoint(9n))).toBe(false);
        expect(await store.advance(ORIGIN, 0n, checkpoint(9n))).toBe(false);
        expect(await store.latest(ORIGIN)).toEqual(checkpoint(3n));
      }));

    it("refuses a first checkpoint that claims a previous size", () =>
      withStore(setup, async (store) => {
        expect(await store.advance(ORIGIN, 3n, checkpoint(5n))).toBe(false);
        expect(await store.latest(ORIGIN)).toBeUndefined();
      }));

    it("keeps logs apart", () =>
      withStore(setup, async (store) => {
        await store.advance(ORIGIN, 0n, checkpoint(3n));
        await store.advance(OTHER_ORIGIN, 0n, checkpoint(7n));
        expect(await store.latest(ORIGIN)).toEqual(checkpoint(3n));
        expect(await store.latest(OTHER_ORIGIN)).toEqual(checkpoint(7n));
      }));

    it("lets exactly one of several concurrent advances from the same size win", () =>
      withStore(setup, async (store) => {
        const sizes = [4n, 5n, 6n, 7n, 8n];
        const outcomes = await Promise.all(sizes.map((size) => store.advance(ORIGIN, 0n, checkpoint(size))));
        const winner = sizes.filter((_, i) => outcomes[i]);
        expect(winner).toHaveLength(1);
        expect(await store.latest(ORIGIN)).toEqual(checkpoint(winner[0] ?? -1n));
      }));
  });
};
