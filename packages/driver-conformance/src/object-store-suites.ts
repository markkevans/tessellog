import type { TreeState } from "@tessellog/appender";
import { rootHash } from "@tessellog/core";
import { describe, expect, it } from "vitest";

type ObjectStore = {
  readonly get: (key: string) => Promise<Uint8Array | undefined>;
  readonly put: (key: string, data: Uint8Array) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  readonly deleteMany: (keys: readonly string[]) => Promise<void>;
};

type Coordinator = {
  readonly sequence: (entries: readonly Uint8Array[]) => Promise<bigint>;
  readonly readSequenced: (fromIndex: bigint) => Promise<readonly Uint8Array[]>;
  readonly readTreeState: () => Promise<TreeState>;
  readonly advanceTreeState: (expectedSize: bigint, next: TreeState) => Promise<boolean>;
  readonly forgetSequencedBefore: (size: bigint) => Promise<void>;
};

export type Harness<T> = { readonly subject: T; readonly cleanup: () => Promise<void> };

export type Setup<T> = () => Promise<Harness<T>>;

const using = async <T, R>(setup: Setup<T>, test: (subject: T) => Promise<R>): Promise<R> => {
  const { subject, cleanup } = await setup();
  try {
    return await test(subject);
  } finally {
    await cleanup();
  }
};

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

export const describeObjectStore = (name: string, setup: Setup<ObjectStore>): void => {
  describe(`${name} conforms to the ObjectStore contract`, () => {
    it("reports a missing object as undefined", () =>
      using(setup, async (store) => {
        expect(await store.get("tile/0/000")).toBeUndefined();
      }));

    it("returns what was put", () =>
      using(setup, async (store) => {
        await store.put("tile/0/000.p/1", bytes("hashes"));
        expect(await store.get("tile/0/000.p/1")).toEqual(bytes("hashes"));
      }));

    it("replaces an object put twice", () =>
      using(setup, async (store) => {
        await store.put("checkpoint", bytes("first"));
        await store.put("checkpoint", bytes("second"));
        expect(await store.get("checkpoint")).toEqual(bytes("second"));
      }));

    it("deletes objects, including ones that do not exist", () =>
      using(setup, async (store) => {
        await store.put("tile/entries/000.p/1", bytes("bundle"));
        await store.delete("tile/entries/000.p/1");
        await store.delete("tile/entries/000.p/2");
        expect(await store.get("tile/entries/000.p/1")).toBeUndefined();
      }));
    it("deletes many objects at once, including ones that do not exist", () =>
      using(setup, async (store) => {
        await store.put("tile/0/000.p/1", bytes("a"));
        await store.put("tile/0/000.p/2", bytes("b"));
        await store.put("tile/0/000", bytes("c"));
        await store.deleteMany(["tile/0/000.p/1", "tile/0/000.p/2", "tile/0/000.p/3"]);
        expect(await store.get("tile/0/000.p/1")).toBeUndefined();
        expect(await store.get("tile/0/000.p/2")).toBeUndefined();
        expect(await store.get("tile/0/000")).toEqual(bytes("c"));
      }));

    it("accepts an empty list of objects to delete", () =>
      using(setup, async (store) => {
        await store.deleteMany([]);
      }));
  });
};

export const describeCoordinator = (name: string, setup: Setup<Coordinator>): void => {
  describe(`${name} conforms to the Coordinator contract`, () => {
    it("assigns contiguous indices across batches", () =>
      using(setup, async (coordinator) => {
        expect(await coordinator.sequence([bytes("a"), bytes("b")])).toBe(0n);
        expect(await coordinator.sequence([bytes("c")])).toBe(2n);
      }));

    it("gives concurrent batches distinct contiguous ranges", () =>
      using(setup, async (coordinator) => {
        const firsts = await Promise.all(
          Array.from({ length: 10 }, (_, i) => coordinator.sequence([bytes(`a${i}`), bytes(`b${i}`)])),
        );
        expect([...firsts].sort((a, b) => Number(a - b))).toEqual(
          Array.from({ length: 10 }, (_, i) => BigInt(i * 2)),
        );
      }));

    it("reserves no indices for an empty batch", () =>
      using(setup, async (coordinator) => {
        expect(await coordinator.sequence([])).toBe(0n);
        expect(await coordinator.sequence([bytes("a")])).toBe(0n);
        expect(await coordinator.sequence([])).toBe(1n);
        expect(await coordinator.sequence([bytes("b")])).toBe(1n);
        expect(await coordinator.readSequenced(0n)).toEqual([bytes("a"), bytes("b")]);
      }));

    it("reads back sequenced entries from an index in order", () =>
      using(setup, async (coordinator) => {
        await coordinator.sequence([bytes("a"), bytes("b")]);
        await coordinator.sequence([bytes("c")]);
        expect(await coordinator.readSequenced(1n)).toEqual([bytes("b"), bytes("c")]);
      }));

    it("starts with an empty tree", () =>
      using(setup, async (coordinator) => {
        expect(await coordinator.readTreeState()).toEqual({ size: 0n, rootHash: rootHash([]) });
      }));

    it("advances the tree state from the expected size", () =>
      using(setup, async (coordinator) => {
        const next = { size: 2n, rootHash: new Uint8Array(32).fill(1) };
        expect(await coordinator.advanceTreeState(0n, next)).toBe(true);
        expect(await coordinator.readTreeState()).toEqual(next);
      }));

    it("refuses to advance from a size it is not at", () =>
      using(setup, async (coordinator) => {
        expect(
          await coordinator.advanceTreeState(5n, { size: 7n, rootHash: new Uint8Array(32) }),
        ).toBe(false);
        expect((await coordinator.readTreeState()).size).toBe(0n);
      }));

    it("forgets batches entirely below a size, keeping later entries readable", () =>
      using(setup, async (coordinator) => {
        await coordinator.sequence([bytes("a"), bytes("b")]);
        await coordinator.sequence([bytes("c"), bytes("d")]);
        await coordinator.forgetSequencedBefore(3n);
        expect(await coordinator.readSequenced(3n)).toEqual([bytes("d")]);
        expect(await coordinator.sequence([bytes("e")])).toBe(4n);
      }));
  });
};
