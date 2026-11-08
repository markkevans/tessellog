import { describe, expect, it } from "vitest";
import {
  createAppender,
  createMemoryDriver,
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
