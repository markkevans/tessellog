import { concatBytes } from "@noble/hashes/utils";
import { decodeBundle, leafHash } from "@tessellog/core";
import { describe, expect, it, vi } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  type Appender,
  type LogDriver,
} from "../src/index.js";

const entry = (text: string): Uint8Array => new TextEncoder().encode(text);

const newAppender = () => createAppender({ driver: createMemoryDriver() });

describe("appending entries", () => {
  it("assigns contiguous indices from zero", async () => {
    const appender = newAppender();
    const indices = [
      await appender.add(entry("first")),
      await appender.add(entry("second")),
      await appender.add(entry("third")),
    ];
    expect(indices).toEqual([
      { index: 0n, isDup: false },
      { index: 1n, isDup: false },
      { index: 2n, isDup: false },
    ]);
  });

  it("assigns distinct indices to concurrent adds", async () => {
    const appender = newAppender();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => appender.add(entry(`entry ${i}`))),
    );
    expect(results.map(({ index }) => index).sort((a, b) => Number(a - b))).toEqual(
      Array.from({ length: 10 }, (_, i) => BigInt(i)),
    );
  });
});

const entries = (count: number): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => entry(`entry ${i}`));

const addAll = async (appender: Appender, toAdd: readonly Uint8Array[]): Promise<void> => {
  await toAdd.reduce<Promise<unknown>>(
    async (previous, next) => {
      await previous;
      return appender.add(next);
    },
    Promise.resolve(),
  );
};

const integratedTo = async (appender: Appender, size: bigint): Promise<void> => {
  await vi.waitFor(async () => {
    expect(await appender.reader.integratedSize()).toBe(size);
  });
};

describe("integrating appended entries", () => {
  it("starts with an empty integrated tree", async () => {
    expect(await newAppender().reader.integratedSize()).toBe(0n);
  });

  it("stores added entries in an entry bundle", async () => {
    const appender = newAppender();
    const added = entries(3);
    await addAll(appender, added);
    await integratedTo(appender, 3n);
    const bundle = await appender.reader.readEntryBundle({ index: 0n, width: 3 });
    expect(bundle && decodeBundle(bundle)).toEqual({ ok: true, value: added });
  });

  it("stores the leaf hash of each entry in level-0 tiles", async () => {
    const appender = newAppender();
    const added = entries(3);
    await addAll(appender, added);
    await integratedTo(appender, 3n);
    expect(await appender.reader.readTile({ level: 0, index: 0n, width: 3 })).toEqual(
      concatBytes(...added.map(leafHash)),
    );
  });

  it("fills a tile and bundle before starting the next", async () => {
    const appender = newAppender();
    const added = entries(300);
    await addAll(appender, added);
    await integratedTo(appender, 300n);
    const fullBundle = await appender.reader.readEntryBundle({ index: 0n, width: 256 });
    const partialBundle = await appender.reader.readEntryBundle({ index: 1n, width: 44 });
    expect(fullBundle && decodeBundle(fullBundle)).toEqual({ ok: true, value: added.slice(0, 256) });
    expect(partialBundle && decodeBundle(partialBundle)).toEqual({ ok: true, value: added.slice(256) });
    expect(await appender.reader.readTile({ level: 0, index: 1n, width: 44 })).toEqual(
      concatBytes(...added.slice(256).map(leafHash)),
    );
  });

  it("reports nothing for tiles and bundles that do not exist", async () => {
    const appender = newAppender();
    expect(await appender.reader.readTile({ level: 0, index: 0n, width: 1 })).toBeUndefined();
    expect(await appender.reader.readEntryBundle({ index: 0n, width: 1 })).toBeUndefined();
  });
});

describe("reporting integration failures", () => {
  const failingWith = (overrides: Partial<LogDriver>) => {
    const reported: unknown[] = [];
    const appender = createAppender({
      driver: { ...createMemoryDriver(), ...overrides },
      onError: (error) => {
        reported.push(error);
      },
    });
    return { appender, reported };
  };

  it("reports a partial tile missing from storage", async () => {
    const { appender, reported } = failingWith({ readTile: async () => undefined });
    await addAll(appender, entries(2));
    await vi.waitFor(() => {
      expect(String(reported[0])).toContain("missing tile tile/0/000.p/1");
    });
  });

  it("reports a partial entry bundle missing from storage", async () => {
    const { appender, reported } = failingWith({ readEntryBundle: async () => undefined });
    await addAll(appender, entries(2));
    await vi.waitFor(() => {
      expect(String(reported[0])).toContain("missing entry bundle tile/entries/000.p/1");
    });
  });

  it("reports a corrupt entry bundle in storage", async () => {
    const { appender, reported } = failingWith({
      readEntryBundle: async () => Uint8Array.of(0x00),
    });
    await addAll(appender, entries(2));
    await vi.waitFor(() => {
      expect(String(reported[0])).toContain("corrupt entry bundle tile/entries/000.p/1");
    });
  });

  it("logs failures to the console by default", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const appender = createAppender({
      driver: { ...createMemoryDriver(), readTile: async () => undefined },
    });
    await addAll(appender, entries(2));
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });
    consoleError.mockRestore();
  });
});
