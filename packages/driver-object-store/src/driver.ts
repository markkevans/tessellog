import type { LogDriver } from "@tessellog/appender";
import { entriesPath, partialPathsOf, tilePath, tilesFilledBetween } from "@tessellog/core";
import type { Coordinator, Lease, ObjectStore } from "./contracts.js";

const CHECKPOINT_KEY = "checkpoint";
const GC_STATE_KEY = ".state/gc";

export const createObjectStoreDriver = ({
  objects,
  coordinator,
}: {
  readonly objects: ObjectStore;
  readonly coordinator: Coordinator;
}): LogDriver => ({
  sequence: (entries) => coordinator.sequence(entries),
  readSequenced: (fromIndex) => coordinator.readSequenced(fromIndex),
  readTreeState: () => coordinator.readTreeState(),
  readTile: (address) => objects.get(tilePath(address)),
  readEntryBundle: (address) => objects.get(entriesPath(address)),
  writeIntegration: async ({ size, rootHash, tiles, bundles }) => {
    const { size: expectedSize } = await coordinator.readTreeState();
    await Promise.all([
      ...tiles.map((tile) => objects.put(tilePath(tile), tile.hashes)),
      ...bundles.map((bundle) => objects.put(entriesPath(bundle), bundle.data)),
    ]);
    if (!(await coordinator.advanceTreeState(expectedSize, { size, rootHash }))) {
      throw new Error("tree state changed while integrating: is another writer running?");
    }
  },
  readCheckpoint: () => objects.get(CHECKPOINT_KEY),
  writeCheckpoint: (checkpoint) => objects.put(CHECKPOINT_KEY, checkpoint),
  collectGarbage: async (upToSize) => {
    const stored = await objects.get(GC_STATE_KEY);
    const collected = BigInt(stored === undefined ? "0" : new TextDecoder().decode(stored));
    await objects.deleteMany(partialPathsOf(tilesFilledBetween({ fromSize: collected, toSize: upToSize })));
    await coordinator.forgetSequencedBefore(upToSize);
    await objects.put(GC_STATE_KEY, new TextEncoder().encode(upToSize.toString()));
  },
});

export type LeasedDriver = LogDriver & {
  readonly close: () => Promise<void>;
};

export const createLeasedDriver = ({
  objects,
  coordinator,
  lease,
}: {
  readonly objects: ObjectStore;
  readonly coordinator: Coordinator;
  readonly lease: Lease;
}): LeasedDriver => {
  const driver = createObjectStoreDriver({ objects, coordinator });
  return {
    ...driver,
    writeIntegration: async (update) => {
      await lease.renew();
      await driver.writeIntegration(update);
    },
    close: () => lease.release(),
  };
};
