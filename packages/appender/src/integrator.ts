import { integrate, leafHash, tilePath, type TileAddress } from "@tessellog/core";
import { bundleEntries } from "./bundling.js";
import type { LogDriver } from "./driver.js";
import { serialTasks } from "./serial-tasks.js";

export const requireTile =
  (driver: LogDriver) =>
  async (address: TileAddress): Promise<Uint8Array> => {
    const tile = await driver.readTile(address);
    if (tile === undefined) {
      throw new Error(`missing tile ${tilePath(address)}`);
    }
    return tile;
  };

export const integrateOutstanding = async (driver: LogDriver): Promise<bigint> => {
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

export type Integrator = {
  readonly schedule: () => void;
  readonly idle: () => Promise<void>;
};

export const createIntegrator = ({
  driver,
  onError,
  onIntegrated,
}: {
  readonly driver: LogDriver;
  readonly onError: (error: unknown) => void;
  readonly onIntegrated: (count: bigint) => void;
}): Integrator => {
  const tasks = serialTasks(onError);
  return {
    schedule: () => {
      tasks.run(async () => {
        onIntegrated(await integrateOutstanding(driver));
      });
    },
    idle: () => tasks.idle(),
  };
};
