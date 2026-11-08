import {
  leafHash,
  openCheckpoint,
  rootHash,
  type Checkpoint,
  type NoteSigner,
} from "@tessellog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  type Appender,
  type AppenderOptions,
  type LogDriver,
} from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";

const CHECKPOINT_INTERVAL_MS = 10_000;
const REPUBLISH_INTERVAL_MS = 600_000;
const BATCH_MAX_AGE_MS = 250;

const entry = (text: string): Uint8Array => new TextEncoder().encode(text);

const appenderWith = (overrides?: Partial<AppenderOptions>): Appender =>
  createAppender({ driver: createMemoryDriver(), signer: logSigner(), ...overrides });

const publishedCheckpoint = async (
  appender: Appender,
  origin: string = LOG_KEY_NAME,
): Promise<Checkpoint | undefined> => {
  const message = await appender.reader.readCheckpoint();
  if (message === undefined) {
    return undefined;
  }
  const opened = await openCheckpoint({ message, origin, logVerifier: logVerifier() });
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.checkpoint;
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

describe("publishing checkpoints", () => {
  it("publishes nothing before the first checkpoint interval", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS - 1);
    expect(await appender.reader.readCheckpoint()).toBeUndefined();
  });

  it("publishes a signed checkpoint of the empty tree", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    expect(await publishedCheckpoint(appender)).toEqual({
      origin: LOG_KEY_NAME,
      size: 0n,
      rootHash: rootHash([]),
      extensions: [],
    });
  });

  it("publishes a checkpoint covering integrated entries", async () => {
    vi.useFakeTimers();
    const appender = appenderWith();
    const added = [entry("a"), entry("b"), entry("c")];
    const adding = Promise.all(added.map((e) => appender.add(e)));
    await vi.advanceTimersByTimeAsync(BATCH_MAX_AGE_MS);
    await adding;
    await vi.waitFor(async () => {
      expect(await appender.reader.integratedSize()).toBe(3n);
    });
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    const checkpoint = await publishedCheckpoint(appender);
    expect(checkpoint?.size).toBe(3n);
    expect(checkpoint?.rootHash).toEqual(rootHash(added.map(leafHash)));
  });

  it("uses a configured origin instead of the signer name", async () => {
    vi.useFakeTimers();
    const appender = appenderWith({ origin: "example.com/log" });
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    expect((await publishedCheckpoint(appender, "example.com/log"))?.origin).toBe(
      "example.com/log",
    );
  });

  it("honours a configured checkpoint interval", async () => {
    vi.useFakeTimers();
    const appender = appenderWith({ checkpointInterval: 1_000 });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await appender.reader.readCheckpoint()).toBeDefined();
  });

  it("republishes an unchanged tree only after the republish interval", async () => {
    vi.useFakeTimers();
    const { driver, writes } = countingCheckpointWrites();
    appenderWith({ driver });
    await vi.advanceTimersByTimeAsync(REPUBLISH_INTERVAL_MS);
    expect(writes()).toBe(1);
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    expect(writes()).toBe(2);
  });

  it("reports a checkpoint that cannot be signed", async () => {
    vi.useFakeTimers();
    const reported: unknown[] = [];
    const misnamed: NoteSigner = { ...logSigner(), name: "Peter Neumann" };
    appenderWith({
      signer: misnamed,
      origin: "example.com/log",
      onError: (error) => {
        reported.push(error);
      },
    });
    await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
    expect(String(reported[0])).toContain("invalid signer name Peter Neumann");
  });
});
