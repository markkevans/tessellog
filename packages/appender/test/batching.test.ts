import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  type AddResult,
  type AppenderOptions,
  type LogDriver,
} from "../src/index.js";
import { logSigner } from "./fixtures/keys.js";

const DEFAULT_MAX_AGE_MS = 250;
const DEFAULT_MAX_SIZE = 256;

const entry = (i: number): Uint8Array => new TextEncoder().encode(`entry ${i}`);

const recordingDriver = (): { driver: LogDriver; batchSizes: () => readonly number[] } => {
  const memory = createMemoryDriver();
  let sizes: readonly number[] = [];
  return {
    driver: {
      ...memory,
      sequence: async (entries) => {
        sizes = [...sizes, entries.length];
        return memory.sequence(entries);
      },
    },
    batchSizes: () => sizes,
  };
};

const appenderWith = (overrides?: Partial<AppenderOptions>) =>
  createAppender({ driver: createMemoryDriver(), signer: logSigner(), ...overrides });

const tracked = (pending: Promise<AddResult>): (() => "pending" | "settled") => {
  let state: "pending" | "settled" = "pending";
  void pending.then(() => {
    state = "settled";
  });
  return () => state;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("batching entries", () => {
  it("holds a partial batch until it reaches the default maximum age", async () => {
    vi.useFakeTimers();
    const pending = appenderWith().add(entry(0));
    const state = tracked(pending);
    await vi.advanceTimersByTimeAsync(DEFAULT_MAX_AGE_MS - 1);
    expect(state()).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ index: 0n, isDup: false });
  });

  it("sequences a full batch without waiting", async () => {
    vi.useFakeTimers();
    const appender = appenderWith({ batching: { maxSize: 4 } });
    const results = await Promise.all([0, 1, 2, 3].map((i) => appender.add(entry(i))));
    expect(results.map(({ index }) => index)).toEqual([0n, 1n, 2n, 3n]);
  });

  it("sequences each batch with a single driver call", async () => {
    vi.useFakeTimers();
    const { driver, batchSizes } = recordingDriver();
    const appender = appenderWith({ driver });
    const pending = Array.from({ length: DEFAULT_MAX_SIZE + 10 }, (_, i) => appender.add(entry(i)));
    await vi.advanceTimersByTimeAsync(DEFAULT_MAX_AGE_MS);
    await Promise.all(pending);
    expect(batchSizes()).toEqual([DEFAULT_MAX_SIZE, 10]);
  });

  it("honours a configured maximum age", async () => {
    vi.useFakeTimers();
    const state = tracked(appenderWith({ batching: { maxAge: 10 } }).add(entry(0)));
    await vi.advanceTimersByTimeAsync(9);
    expect(state()).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(state()).toBe("settled");
  });

  it("rejects every add in a batch the driver fails to sequence", async () => {
    vi.useFakeTimers();
    const failure = new Error("storage unavailable");
    const appender = appenderWith({
      driver: { ...createMemoryDriver(), sequence: async () => Promise.reject(failure) },
      batching: { maxSize: 2 },
    });
    const results = await Promise.allSettled([appender.add(entry(0)), appender.add(entry(1))]);
    expect(results).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
  });
});
