import { createAppender, createLogReader } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

export const runUntilSignalled = async (signer: NoteSigner) => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const appender = createAppender({
    driver,
    signer,
    batching: { maxSize: 256, maxAge: 250 },
    checkpointInterval: 1_000,
    garbageCollection: { interval: 60_000 },
    onError: (error) => console.error("background task failed", error),
  });

  process.once("SIGTERM", async () => {
    await appender.shutdown();
    await driver.close();
  });
  return appender;
};

export const freeze = async () => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const reader = createLogReader({ driver });
  console.log(`frozen at ${await reader.integratedSize()} entries`);
  return reader;
};
