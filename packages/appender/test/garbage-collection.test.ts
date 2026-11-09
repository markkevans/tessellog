import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppender, createMemoryDriver, type AppenderOptions, type LogDriver } from "../src/index.js";
import { logSigner } from "./fixtures/keys.js";

const entry = (i: number): Uint8Array => new TextEncoder().encode(`entry ${i}`);

const recordingGarbage = (): { driver: LogDriver; collected: () => readonly bigint[] } => {
  const memory = createMemoryDriver();
  let sizes: readonly bigint[] = [];
  return {
    driver: {
      ...memory,
      collectGarbage: async (upToSize) => {
        sizes = [...sizes, upToSize];
        await memory.collectGarbage(upToSize);
      },
    },
    collected: () => sizes,
  };
};

const appenderWith = (overrides: Partial<AppenderOptions>) =>
  createAppender({ driver: createMemoryDriver(), signer: logSigner(), batching: { maxSize: 1 }, ...overrides });

afterEach(() => {
  vi.useRealTimers();
});

describe("collecting garbage in the background", () => {
  it("collects up to the published size on Tessera's default one-minute interval", async () => {
    vi.useFakeTimers();
    const { driver, collected } = recordingGarbage();
    const appender = appenderWith({ driver });
    await Promise.all([0, 1, 2].map((i) => appender.add(entry(i))));
    await vi.waitFor(async () => {
      expect(await appender.reader.integratedSize()).toBe(3n);
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(collected().at(-1)).toBe(3n);
  });

  it("collects nothing before a checkpoint has been published", async () => {
    vi.useFakeTimers();
    const { driver, collected } = recordingGarbage();
    appenderWith({ driver, checkpointInterval: 120_000, checkpointRepublishInterval: 120_000 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(collected()).toEqual([]);
  });

  it("can be disabled", async () => {
    vi.useFakeTimers();
    const { driver, collected } = recordingGarbage();
    appenderWith({ driver, garbageCollection: { interval: 0 } });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(collected()).toEqual([]);
  });

  it("reports garbage collection failures", async () => {
    vi.useFakeTimers();
    const reported: unknown[] = [];
    appenderWith({
      driver: {
        ...createMemoryDriver(),
        collectGarbage: async () => {
          throw new Error("storage refused the delete");
        },
      },
      garbageCollection: { interval: 1_000 },
      checkpointInterval: 500,
      checkpointRepublishInterval: 500,
      onError: (error) => {
        reported.push(error);
      },
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(String(reported[0])).toContain("storage refused the delete");
  });

  it("rejects a negative interval", () => {
    expect(() => appenderWith({ garbageCollection: { interval: -1 } })).toThrow(/invalid appender options/);
  });
});
