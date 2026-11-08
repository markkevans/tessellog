import { integrate, leafHash, tilePath, type TileAddress } from "@tessellog/core";
import { createBatcher, type AddResult } from "./batching.js";
import { bundleEntries } from "./bundling.js";
import type { BundleAddress, LogDriver } from "./driver.js";
import { resolveAppenderOptions, type AppenderOptions } from "./options.js";
import { createPublisher } from "./publishing.js";
import { createPushback } from "./pushback.js";
import { serialTasks } from "./serial-tasks.js";

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

const requireTile =
  (driver: LogDriver) =>
  async (address: TileAddress): Promise<Uint8Array> => {
    const tile = await driver.readTile(address);
    if (tile === undefined) {
      throw new Error(`missing tile ${tilePath(address)}`);
    }
    return tile;
  };

const integrateOutstanding = async (driver: LogDriver): Promise<bigint> => {
  const { size: fromSize } = await driver.readTreeState();
  const entries = await driver.readSequenced(fromSize);
  if (entries.length === 0) {
    return 0n;
  }
  const { size, rootHash, tiles } = await integrate({
    fromSize,
    leafHashes: entries.map(leafHash),
    readTile: requireTile(driver),
  });
  const bundles = await bundleEntries({
    fromSize,
    entries,
    readBundle: (address) => driver.readEntryBundle(address),
  });
  await driver.writeIntegration({ size, rootHash, tiles, bundles });
  return size - fromSize;
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
  const integration = serialTasks(onError);
  const publication = serialTasks(onError);
  const publish = createPublisher({
    driver,
    signers: [signer, ...additionalSigners],
    origin,
    republishInterval: checkpointRepublishInterval,
  });
  const publishing = setInterval(() => {
    publication.run(() => publish(Date.now()));
  }, checkpointInterval);
  const outstanding = createPushback(pushback);
  const batch = createBatcher({
    ...batching,
    sequence: async (entries) => {
      const firstIndex = await driver.sequence(entries);
      integration.run(async () => {
        outstanding.integrated(await integrateOutstanding(driver));
      });
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
      clearInterval(publishing);
      await batch.drain();
      await integration.idle();
      publication.run(() => publish(Date.now()));
      await publication.idle();
    },
    reader: readerFor(driver),
  };
};
