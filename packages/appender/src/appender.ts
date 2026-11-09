import type { TileAddress } from "@tessellog/core";
import { createBatcher, type AddResult } from "./batching.js";
import type { BundleAddress, LogDriver } from "./driver.js";
import {
  inMemoryDeduplication,
  layered,
  persistentDeduplication,
  withoutDeduplication,
  type Deduplicate,
} from "./dedup.js";
import { createFollower, noFollower } from "./follower.js";
import { createIntegrator } from "./integrator.js";
import {
  resolveAppenderOptions,
  type AppenderOptions,
  type ResolvedAppenderOptions,
} from "./options.js";
import { startPublishing } from "./publishing.js";
import { createPushback } from "./pushback.js";
import { witnessedPublication } from "./witnessing.js";

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

const deduplicationFor = (
  antispam: ResolvedAppenderOptions["antispam"],
  driver: LogDriver,
): Deduplicate => {
  if (antispam === undefined) {
    return withoutDeduplication;
  }
  const inMemory = inMemoryDeduplication(antispam.inMemoryEntries);
  return antispam.store === undefined
    ? inMemory
    : layered(
        inMemory,
        persistentDeduplication({
          store: antispam.store,
          integratedSize: async () => (await driver.readTreeState()).size,
          pushbackThreshold: antispam.pushbackThreshold,
        }),
      );
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
    antispam,
    witnessing,
    onError,
  } = resolveAppenderOptions(options);
  const deduplicate = deduplicationFor(antispam, driver);
  const outstanding = createPushback(pushback);
  const follower =
    antispam?.store === undefined
      ? noFollower
      : createFollower({ driver, store: antispam.store, onError });
  const integrator = createIntegrator({
    driver,
    onError,
    onIntegrated: (count) => {
      outstanding.integrated(count);
      follower.schedule();
    },
  });
  const publishing = startPublishing({
    driver,
    signers: [signer, ...additionalSigners],
    origin,
    interval: checkpointInterval,
    republishInterval: checkpointRepublishInterval,
    witnessed:
      witnessing === undefined
        ? async (checkpoint) => checkpoint
        : witnessedPublication(witnessing, driver),
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
      return deduplicate(entry, (unique) => outstanding.guard(() => batch.add(unique)));
    },
    shutdown: async () => {
      shutDown = true;
      await batch.drain();
      await integrator.idle();
      follower.schedule();
      await follower.idle();
      await publishing.stop();
    },
    reader: readerFor(driver),
  };
};
