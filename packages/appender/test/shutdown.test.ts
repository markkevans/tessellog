import { openCheckpoint } from "@tessellog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  type Appender,
  type AppenderOptions,
  type LogDriver,
} from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";

const entry = (i: number): Uint8Array => new TextEncoder().encode(`entry ${i}`);

const appenderWith = (overrides?: Partial<AppenderOptions>): Appender =>
  createAppender({ driver: createMemoryDriver(), signer: logSigner(), ...overrides });

const publishedSize = async (appender: Appender): Promise<bigint | undefined> => {
  const message = await appender.reader.readCheckpoint();
  if (message === undefined) {
    return undefined;
  }
  const opened = await openCheckpoint({ message, origin: LOG_KEY_NAME, logVerifier: logVerifier() });
  return opened.ok ? opened.value.checkpoint.size : undefined;
};

const countingCheckpointWrites = (): { driver: LogDriver; writes: () => number } => {
  const memory = createMemoryDriver();
  let count = 0;
  return {
    driver: {
      ...memory,
      writeCheckpoint: async (checkpoint) => {
        count += 1;
        await memory.writeCheckpoint(checkpoint);
      },
    },
    writes: () => count,
  };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("shutting down", () => {
  it("sequences entries still waiting in a batch", async () => {
    const appender = appenderWith();
    const pending = [appender.add(entry(0)), appender.add(entry(1))];
    await appender.shutdown();
    expect(await Promise.all(pending)).toEqual([
      { index: 0n, isDup: false },
      { index: 1n, isDup: false },
    ]);
  });

  it("publishes a checkpoint covering every added entry", async () => {
    const appender = appenderWith();
    const pending = [0, 1, 2].map((i) => appender.add(entry(i)));
    await appender.shutdown();
    await Promise.all(pending);
    expect(await publishedSize(appender)).toBe(3n);
  });

  it("refuses entries added after shutdown", async () => {
    const appender = appenderWith();
    await appender.shutdown();
    await expect(appender.add(entry(0))).rejects.toThrow("appender has been shut down");
  });

  it("leaves no timers running", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    void appender.add(entry(0));
    await appender.shutdown();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops publishing checkpoints", async () => {
    vi.useFakeTimers();
    const { driver, writes } = countingCheckpointWrites();
    const appender = appenderWith({ driver });
    await appender.shutdown();
    const writesAtShutdown = writes();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(writes()).toBe(writesAtShutdown);
  });
});
