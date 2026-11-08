import type { TileAddress } from "@tessellog/core";
import { createBatcher, type AddResult } from "./batching.js";
import type { BundleAddress, LogDriver } from "./driver.js";
import { createIntegrator } from "./integrator.js";
import { resolveAppenderOptions, type AppenderOptions } from "./options.js";
import { startPublishing } from "./publishing.js";
import { createPushback } from "./pushback.js";

export type LogReader = {
  readonly integratedSize: () => Promise<bigint>;
  readonly readTile: (address: TileAddress) => Promise<Uint8Array | undefined>;
  readonly readEntryBundle: (address: BundleAddress) => Promise<Uint8Array | undefined>;
  readonly readCheckpoint: () => Promise<Uint8Array | undefined>;
};

export type Appender = {
  readonly add: (entry: Uint8Array) => Promise<AddResult>;
  readonly shutdown: () => Promise<void>;
  readonly reader: LogReader;
};

const readerFor = (driver: LogDriver): LogReader => ({
  integratedSize: async () => (await driver.readTreeState()).size,
  readTile: (address) => driver.readTile(address),
  readEntryBundle: (address) => driver.readEntryBundle(address),
  readCheckpoint: () => driver.readCheckpoint(),
});

export const createAppender = (options: AppenderOptions): Appender => {
  const {
    driver,
    signer,
    additionalSigners,
    origin = signer.name,
    checkpointInterval,
    checkpointRepublishInterval,
    batching,
    pushback,
    onError,
  } = resolveAppenderOptions(options);
  const outstanding = createPushback(pushback);
  const integrator = createIntegrator({ driver, onError, onIntegrated: outstanding.integrated });
  const publishing = startPublishing({
    driver,
    signers: [signer, ...additionalSigners],
    origin,
    interval: checkpointInterval,
    republishInterval: checkpointRepublishInterval,
    onError,
  });
  const batch = createBatcher({
    ...batching,
    sequence: async (entries) => {
      const firstIndex = await driver.sequence(entries);
      integrator.schedule();
      return firstIndex;
    },
  });
  let shutDown = false;
  return {
    add: async (entry) => {
      if (shutDown) {
        throw new Error("appender has been shut down");
      }
      return outstanding.guard(() => batch.add(entry));
    },
    shutdown: async () => {
      shutDown = true;
      await batch.drain();
      await integrator.idle();
      await publishing.stop();
    },
    reader: readerFor(driver),
  };
};
