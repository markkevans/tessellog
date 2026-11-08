import { sha256 } from "@noble/hashes/sha2";
import { createAppender, createMemoryDriver, type AntispamStore } from "@tessellog/appender";
import { describe, expect, it } from "vitest";
import { testSigner } from "./keys.js";

export type AntispamHarness = {
  readonly store: AntispamStore;
  readonly cleanup: () => Promise<void>;
};

export type AntispamSetup = () => Promise<AntispamHarness>;

const identity = (text: string): Uint8Array => sha256(new TextEncoder().encode(text));

const withStore = async <T>(setup: AntispamSetup, test: (store: AntispamStore) => Promise<T>): Promise<T> => {
  const { store, cleanup } = await setup();
  try {
    return await test(store);
  } finally {
    await cleanup();
  }
};

export const describeAntispamStore = (name: string, setup: AntispamSetup): void => {
  describe(`${name} conforms to the AntispamStore contract`, () => {
    it("starts with nothing followed and nothing known", () =>
      withStore(setup, async (store) => {
        expect(await store.followedSize()).toBe(0n);
        expect(await store.lookup(identity("a"))).toBeUndefined();
      }));

    it("finds recorded identities at their index and advances progress", () =>
      withStore(setup, async (store) => {
        await store.record(
          [
            { identity: identity("a"), index: 0n },
            { identity: identity("b"), index: 1n },
          ],
          2n,
        );
        expect(await store.lookup(identity("b"))).toBe(1n);
        expect(await store.followedSize()).toBe(2n);
      }));

    it("keeps the first index for an identity recorded twice", () =>
      withStore(setup, async (store) => {
        await store.record([{ identity: identity("a"), index: 0n }], 1n);
        await store.record([{ identity: identity("a"), index: 5n }], 6n);
        expect(await store.lookup(identity("a"))).toBe(0n);
      }));

    it("advances progress even when no entries are recorded", () =>
      withStore(setup, async (store) => {
        await store.record([], 3n);
        expect(await store.followedSize()).toBe(3n);
      }));

    it("backs an appender that catches duplicates across sessions", () =>
      withStore(setup, async (store) => {
        const driver = createMemoryDriver();
        const appenderOn = () =>
          createAppender({
            driver,
            signer: testSigner(),
            batching: { maxSize: 1 },
            antispam: { store },
          });
        const first = appenderOn();
        await first.add(new TextEncoder().encode("a"));
        await first.shutdown();
        const second = appenderOn();
        expect(await second.add(new TextEncoder().encode("a"))).toEqual({ index: 0n, isDup: true });
        await second.shutdown();
      }));
  });
};
