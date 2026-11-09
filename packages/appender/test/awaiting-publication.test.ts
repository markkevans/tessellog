import { openCheckpoint, type Checkpoint } from "@tessellog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppender, createMemoryDriver, type Appender, type AppenderOptions } from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";

const CHECKPOINT_INTERVAL_MS = 10_000;

const entry = (text: string): Uint8Array => new TextEncoder().encode(text);

const appenderWith = (overrides?: Partial<AppenderOptions>): Appender =>
  createAppender({
    driver: createMemoryDriver(),
    signer: logSigner(),
    batching: { maxSize: 1 },
    ...overrides,
  });

const checkpointIn = async (message: Uint8Array): Promise<Checkpoint> => {
  const opened = await openCheckpoint({ message, origin: LOG_KEY_NAME, logVerifier: logVerifier() });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.checkpoint;
};

const tracked = <T>(promise: Promise<T>) => {
  let settled = false;
  const outcome = promise.then(
    (value) => {
      settled = true;
      return value;
    },
    (error: unknown) => {
      settled = true;
      throw error;
    },
  );
  return { outcome, settled: () => settled };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("awaiting publication of an entry", () => {
  it("waits until a published checkpoint covers the entry", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    const { index } = await appender.add(entry("a"));
    const awaited = tracked(appender.awaitPublication(index));
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS - 1);
    expect(awaited.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await checkpointIn(await awaited.outcome)).size).toBe(1n);
  });

  it("resolves with the published checkpoint bytes", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    const { index } = await appender.add(entry("a"));
    const awaited = appender.awaitPublication(index);
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    expect(await awaited).toEqual(await appender.reader.readCheckpoint());
  });

  it("resolves at once for an entry that is already published", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    const { index } = await appender.add(entry("a"));
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    const awaited = tracked(appender.awaitPublication(index));
    await vi.advanceTimersByTimeAsync(0);
    expect(awaited.settled()).toBe(true);
  });

  it("waits for a later checkpoint when the entry arrived after the last one", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    await appender.add(entry("a"));
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    const { index } = await appender.add(entry("b"));
    const awaited = tracked(appender.awaitPublication(index));
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS - 1);
    expect(awaited.settled()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await checkpointIn(await awaited.outcome)).size).toBe(2n);
  });

  it("resolves through the final checkpoint published at shutdown", async () => {
    const appender = appenderWith();
    const { index } = await appender.add(entry("a"));
    const awaited = appender.awaitPublication(index);
    await appender.shutdown();
    expect((await checkpointIn(await awaited)).size).toBe(1n);
  });

  it("rejects when the appender shuts down before the index is published", async () => {
    const appender = appenderWith();
    const awaited = appender.awaitPublication(5n);
    await appender.shutdown();
    await expect(awaited).rejects.toThrow("appender shut down before index 5 was published");
  });

  it("rejects an index that a shut-down appender never published", async () => {
    const appender = appenderWith();
    await appender.shutdown();
    await expect(appender.awaitPublication(0n)).rejects.toThrow(
      "appender shut down before index 0 was published",
    );
  });

  it("rejects a negative index", async () => {
    const appender = appenderWith();
    await expect(appender.awaitPublication(-1n)).rejects.toThrow(RangeError);
    await appender.shutdown();
  });
});
