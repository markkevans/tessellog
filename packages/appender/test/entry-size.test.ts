import { describe, expect, it } from "vitest";
import { createAppender, createMemoryDriver, EntryTooLargeError, type LogDriver } from "../src/index.js";
import { logSigner } from "./fixtures/keys.js";

const TLOG_TILES_ENTRY_LIMIT = 65_535;

const countingSequencer = (): { driver: LogDriver; sequenced: () => number } => {
  const memory = createMemoryDriver();
  let count = 0;
  return {
    driver: {
      ...memory,
      sequence: async (entries) => {
        count += entries.length;
        return memory.sequence(entries);
      },
    },
    sequenced: () => count,
  };
};

describe("limiting entry size", () => {
  it("accepts an entry at the tlog-tiles limit of 65,535 bytes", async () => {
    const appender = createAppender({ driver: createMemoryDriver(), signer: logSigner(), batching: { maxSize: 1 } });
    expect(await appender.add(new Uint8Array(TLOG_TILES_ENTRY_LIMIT))).toEqual({ index: 0n, isDup: false });
  });

  it("rejects a larger entry before sequencing it", async () => {
    const { driver, sequenced } = countingSequencer();
    const appender = createAppender({ driver, signer: logSigner(), batching: { maxSize: 1 } });
    const rejected = appender.add(new Uint8Array(TLOG_TILES_ENTRY_LIMIT + 1));
    await expect(rejected).rejects.toBeInstanceOf(EntryTooLargeError);
    await expect(rejected).rejects.toThrow("entry of 65536 bytes exceeds the 65535-byte limit");
    expect(sequenced()).toBe(0);
  });
});
