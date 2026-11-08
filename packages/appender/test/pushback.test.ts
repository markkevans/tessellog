import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  PushbackError,
  type AppenderOptions,
  type LogDriver,
} from "../src/index.js";
import { logSigner } from "./fixtures/keys.js";

const DEFAULT_MAX_OUTSTANDING = 4096;

const entry = (i: number): Uint8Array => new TextEncoder().encode(`entry ${i}`);

const gatedIntegration = (): { driver: LogDriver; release: () => void } => {
  const memory = createMemoryDriver();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    driver: {
      ...memory,
      writeIntegration: async (update) => {
        await gate;
        await memory.writeIntegration(update);
      },
    },
    release: () => release(),
  };
};

const appenderWith = (overrides?: Partial<AppenderOptions>) =>
  createAppender({ driver: createMemoryDriver(), signer: logSigner(), ...overrides });

afterEach(() => {
  vi.useRealTimers();
});

describe("pushing back when integration falls behind", () => {
  it("refuses entries beyond the configured outstanding limit", async () => {
    const { driver } = gatedIntegration();
    const appender = appenderWith({ driver, batching: { maxSize: 1 }, pushback: { maxOutstanding: 2 } });
    await appender.add(entry(0));
    await appender.add(entry(1));
    await expect(appender.add(entry(2))).rejects.toBeInstanceOf(PushbackError);
  });

  it("accepts entries again once integration catches up", async () => {
    const { driver, release } = gatedIntegration();
    const appender = appenderWith({ driver, batching: { maxSize: 1 }, pushback: { maxOutstanding: 2 } });
    await appender.add(entry(0));
    await appender.add(entry(1));
    release();
    await vi.waitFor(async () => {
      expect(await appender.reader.integratedSize()).toBe(2n);
    });
    expect(await appender.add(entry(2))).toEqual({ index: 2n, isDup: false });
  });

  it("counts entries still waiting in a batch as outstanding", async () => {
    vi.useFakeTimers();
    const { driver } = gatedIntegration();
    const appender = appenderWith({ driver, pushback: { maxOutstanding: 2 } });
    void appender.add(entry(0));
    void appender.add(entry(1));
    await expect(appender.add(entry(2))).rejects.toBeInstanceOf(PushbackError);
  });

  it("allows 4096 outstanding entries by default", async () => {
    vi.useFakeTimers();
    const { driver } = gatedIntegration();
    const appender = appenderWith({ driver });
    const accepted = Array.from({ length: DEFAULT_MAX_OUTSTANDING }, (_, i) => appender.add(entry(i)));
    await vi.advanceTimersByTimeAsync(250);
    await Promise.all(accepted);
    await expect(appender.add(entry(DEFAULT_MAX_OUTSTANDING))).rejects.toThrow(
      "too many entries awaiting integration",
    );
  });
});
