import { describe, expect, it } from "vitest";
import { createAppender, createLogReader, createMemoryDriver, type LogDriver } from "../src/index.js";
import { logSigner } from "./fixtures/keys.js";

const entry = (i: number): Uint8Array => new TextEncoder().encode(`entry ${i}`);

const writtenLog = async (entries: number): Promise<LogDriver> => {
  const driver = createMemoryDriver();
  const appender = createAppender({ driver, signer: logSigner(), batching: { maxSize: 1 } });
  await Promise.all(Array.from({ length: entries }, (_, i) => appender.add(entry(i))));
  await appender.shutdown();
  return driver;
};

const refusingWrites = (driver: LogDriver): LogDriver => {
  const refuse = async (): Promise<never> => {
    throw new Error("a quiescent log must not write");
  };
  return {
    ...driver,
    sequence: refuse,
    writeIntegration: refuse,
    writeCheckpoint: refuse,
    collectGarbage: refuse,
  };
};

describe("reading a quiescent log", () => {
  it("serves the last published checkpoint without writing", async () => {
    const driver = await writtenLog(3);
    const reader = createLogReader({ driver: refusingWrites(driver) });
    expect(await reader.readCheckpoint()).toEqual(await driver.readCheckpoint());
  });

  it("reports the integrated size", async () => {
    const reader = createLogReader({ driver: refusingWrites(await writtenLog(3)) });
    expect(await reader.integratedSize()).toBe(3n);
  });

  it("serves tiles and entry bundles", async () => {
    const driver = await writtenLog(3);
    const reader = createLogReader({ driver: refusingWrites(driver) });
    const tile = await driver.readTile({ level: 0, index: 0n, width: 3 });
    const bundle = await driver.readEntryBundle({ index: 0n, width: 3 });
    expect(tile).toBeInstanceOf(Uint8Array);
    expect(bundle).toBeInstanceOf(Uint8Array);
    expect(await reader.readTile({ level: 0, index: 0n, width: 3 })).toEqual(tile);
    expect(await reader.readEntryBundle({ index: 0n, width: 3 })).toEqual(bundle);
  });
});
