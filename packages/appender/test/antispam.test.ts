import { sha256 } from "@noble/hashes/sha2";
import { toHex } from "@tessellog/core";
import { describe, expect, it, vi } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  createMemoryAntispamStore,
  type AntispamStore,
  type AppenderOptions,
  type LogDriver,
} from "../src/index.js";
import { logSigner } from "./fixtures/keys.js";

const entry = (text: string): Uint8Array => new TextEncoder().encode(text);

const countingSequencer = (
  overrides?: Partial<LogDriver>,
): { driver: LogDriver; sequenced: () => number } => {
  const memory = { ...createMemoryDriver(), ...overrides };
  let count = 0;
  return {
    driver: {
      ...memory,
      sequence: async (entries) => {
        const firstIndex = await memory.sequence(entries);
        count += entries.length;
        return firstIndex;
      },
    },
    sequenced: () => count,
  };
};

const appenderWith = (overrides?: Partial<AppenderOptions>) =>
  createAppender({
    driver: createMemoryDriver(),
    signer: logSigner(),
    batching: { maxSize: 1 },
    antispam: { inMemoryEntries: 10 },
    ...overrides,
  });

describe("deduplicating recently added entries", () => {
  it("returns the original index for a repeated entry", async () => {
    const appender = appenderWith();
    expect(await appender.add(entry("a"))).toEqual({ index: 0n, isDup: false });
    expect(await appender.add(entry("a"))).toEqual({ index: 0n, isDup: true });
    expect(await appender.add(entry("b"))).toEqual({ index: 1n, isDup: false });
  });

  it("does not sequence a duplicate again", async () => {
    const { driver, sequenced } = countingSequencer();
    const appender = appenderWith({ driver });
    await appender.add(entry("a"));
    await appender.add(entry("a"));
    expect(sequenced()).toBe(1);
  });

  it("shares one sequencing between concurrent duplicates", async () => {
    const { driver, sequenced } = countingSequencer();
    const appender = appenderWith({ driver });
    expect(await Promise.all([appender.add(entry("a")), appender.add(entry("a"))])).toEqual([
      { index: 0n, isDup: false },
      { index: 0n, isDup: true },
    ]);
    expect(sequenced()).toBe(1);
  });

  it("forgets an entry whose add failed so it can be retried", async () => {
    const memory = createMemoryDriver();
    let failNext = true;
    const appender = appenderWith({
      driver: {
        ...memory,
        sequence: async (entries) => {
          if (failNext) {
            failNext = false;
            throw new Error("transient storage failure");
          }
          return memory.sequence(entries);
        },
      },
    });
    await expect(appender.add(entry("a"))).rejects.toThrow("transient storage failure");
    expect(await appender.add(entry("a"))).toEqual({ index: 0n, isDup: false });
  });

  it("forgets the least recently used entries beyond its capacity", async () => {
    const appender = appenderWith({ antispam: { inMemoryEntries: 2 } });
    await appender.add(entry("a"));
    await appender.add(entry("b"));
    await appender.add(entry("a"));
    await appender.add(entry("c"));
    expect(await appender.add(entry("a"))).toEqual({ index: 0n, isDup: true });
    expect(await appender.add(entry("b"))).toEqual({ index: 3n, isDup: false });
  });

  it("sequences duplicates again when antispam is not configured", async () => {
    const appender = createAppender({
      driver: createMemoryDriver(),
      signer: logSigner(),
      batching: { maxSize: 1 },
    });
    await appender.add(entry("a"));
    expect(await appender.add(entry("a"))).toEqual({ index: 1n, isDup: false });
  });
});

const identityOf = (text: string): string => toHex(sha256(entry(text)));

const lookupOnly = (lookup: AntispamStore["lookup"]): AntispamStore => ({
  lookup,
  followedSize: async () => 0n,
  record: async () => undefined,
});

const storeKnowing = (known: Readonly<Record<string, bigint>>): AntispamStore =>
  lookupOnly(async (identity) => known[toHex(identity)]);

describe("consulting a persistent antispam store", () => {
  it("returns the stored index for an entry the store already knows", async () => {
    const { driver, sequenced } = countingSequencer();
    const appender = appenderWith({
      driver,
      antispam: { store: storeKnowing({ [identityOf("a")]: 7n }) },
    });
    expect(await appender.add(entry("a"))).toEqual({ index: 7n, isDup: true });
    expect(sequenced()).toBe(0);
  });

  it("sequences entries the store does not know", async () => {
    const appender = appenderWith({ antispam: { store: storeKnowing({}) } });
    expect(await appender.add(entry("a"))).toEqual({ index: 0n, isDup: false });
  });

  it("rejects the add when the store cannot be consulted", async () => {
    const appender = appenderWith({
      antispam: {
        store: lookupOnly(async () => {
          throw new Error("antispam store unavailable");
        }),
      },
    });
    await expect(appender.add(entry("a"))).rejects.toThrow("antispam store unavailable");
  });
});

describe("following the log into the antispam store", () => {
  it("records integrated entries in the store", async () => {
    const store = createMemoryAntispamStore();
    const appender = appenderWith({ antispam: { store } });
    await appender.add(entry("a"));
    await appender.add(entry("b"));
    await appender.shutdown();
    expect(await store.followedSize()).toBe(2n);
    expect(await store.lookup(sha256(entry("b")))).toBe(1n);
  });

  it("catches a duplicate from an earlier appender session", async () => {
    const driver = createMemoryDriver();
    const store = createMemoryAntispamStore();
    const first = appenderWith({ driver, antispam: { store } });
    await first.add(entry("a"));
    await first.shutdown();
    const second = appenderWith({ driver, antispam: { store } });
    expect(await second.add(entry("a"))).toEqual({ index: 0n, isDup: true });
    expect(await second.add(entry("b"))).toEqual({ index: 1n, isDup: false });
  });

  it("follows entries spread across several bundles", async () => {
    const store = createMemoryAntispamStore();
    const appender = appenderWith({ batching: { maxSize: 256, maxAge: 0 }, antispam: { store } });
    await Promise.all(Array.from({ length: 300 }, (_, i) => appender.add(entry(`e${i}`))));
    await appender.shutdown();
    expect(await store.followedSize()).toBe(300n);
    expect(await store.lookup(sha256(entry("e299")))).toBeDefined();
  });

  it("reports a store that fails to record", async () => {
    const reported: unknown[] = [];
    const store = createMemoryAntispamStore();
    const appender = appenderWith({
      antispam: {
        store: {
          ...store,
          record: async () => {
            throw new Error("antispam store is read-only");
          },
        },
      },
      onError: (error) => {
        reported.push(error);
      },
    });
    await appender.add(entry("a"));
    await appender.shutdown();
    expect(String(reported[0])).toContain("antispam store is read-only");
  });
});

const DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD = 2048;

const gatedStore = (): { store: AntispamStore; release: () => void } => {
  const memory = createMemoryAntispamStore();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    store: {
      ...memory,
      record: async (entries, followedSize) => {
        await gate;
        await memory.record(entries, followedSize);
      },
    },
    release: () => release(),
  };
};

const integratedTo = async (appender: { reader: { integratedSize: () => Promise<bigint> } }, size: bigint) => {
  await vi.waitFor(async () => {
    expect(await appender.reader.integratedSize()).toBe(size);
  });
};

describe("pushing back when the antispam follower lags", () => {
  it("refuses entries while the follower is beyond the threshold", async () => {
    const { store } = gatedStore();
    const appender = appenderWith({ antispam: { store, pushbackThreshold: 2 } });
    await appender.add(entry("a"));
    await appender.add(entry("b"));
    await appender.add(entry("c"));
    await integratedTo(appender, 3n);
    const refused = appender.add(entry("d"));
    await expect(refused).rejects.toBeInstanceOf(PushbackAntispamError);
    await expect(refused).rejects.toBeInstanceOf(PushbackError);
  });

  it("accepts entries again once the follower catches up", async () => {
    const { store, release } = gatedStore();
    const appender = appenderWith({ antispam: { store, pushbackThreshold: 2 } });
    await appender.add(entry("a"));
    await appender.add(entry("b"));
    await appender.add(entry("c"));
    await integratedTo(appender, 3n);
    release();
    await vi.waitFor(async () => {
      expect(await store.followedSize()).toBe(3n);
    });
    expect(await appender.add(entry("d"))).toEqual({ index: 3n, isDup: false });
  });

  it(
    "allows a lag of exactly 2048 entries by default, and refuses beyond it",
    async () => {
      const { store } = gatedStore();
      const appender = appenderWith({ batching: { maxSize: 256, maxAge: 0 }, antispam: { store } });
      const addMany = (from: number, count: number) =>
        Promise.all(Array.from({ length: count }, (_, i) => appender.add(entry(`e${from + i}`))));
      await addMany(0, DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD);
      await integratedTo(appender, BigInt(DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD));
      await addMany(DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD, 1);
      await integratedTo(appender, BigInt(DEFAULT_ANTISPAM_PUSHBACK_THRESHOLD + 1));
      await expect(appender.add(entry("one too many"))).rejects.toThrow(
        "antispam follower is too far behind",
      );
    },
    20_000,
  );
});
