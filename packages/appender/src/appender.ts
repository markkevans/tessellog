import { integrate, leafHash, tilePath, type TileAddress } from "@tessellog/core";
import { bundleEntries } from "./bundling.js";
import type { BundleAddress, LogDriver } from "./driver.js";

export type AddResult = {
  readonly index: bigint;
  readonly isDup: boolean;
};

export type LogReader = {
  readonly integratedSize: () => Promise<bigint>;
  readonly readTile: (address: TileAddress) => Promise<Uint8Array | undefined>;
  readonly readEntryBundle: (address: BundleAddress) => Promise<Uint8Array | undefined>;
};

export type Appender = {
  readonly add: (entry: Uint8Array) => Promise<AddResult>;
  readonly reader: LogReader;
};

export type AppenderOptions = {
  readonly driver: LogDriver;
  readonly onError?: (error: unknown) => void;
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

const integrateOutstanding = async (driver: LogDriver): Promise<void> => {
  const { size: fromSize } = await driver.readTreeState();
  const entries = await driver.readSequenced(fromSize);
  if (entries.length === 0) {
    return;
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
};

export const createAppender = ({
  driver,
  onError = (error) => console.error("tessellog integration failed", error),
}: AppenderOptions): Appender => {
  let integration: Promise<void> = Promise.resolve();
  const scheduleIntegration = (): void => {
    integration = integration.then(() => integrateOutstanding(driver)).catch(onError);
  };
  return {
    add: async (entry) => {
      const index = await driver.sequence([entry]);
      scheduleIntegration();
      return { index, isDup: false };
    },
    reader: {
      integratedSize: async () => (await driver.readTreeState()).size,
      readTile: (address) => driver.readTile(address),
      readEntryBundle: (address) => driver.readEntryBundle(address),
    },
  };
};
