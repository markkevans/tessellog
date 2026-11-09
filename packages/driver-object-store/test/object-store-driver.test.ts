import { describeCoordinator, describeLogDriver, describeObjectStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import {
  createMemoryCoordinator,
  createMemoryObjectStore,
  createObjectStoreDriver,
} from "../src/index.js";

const noCleanup = async (): Promise<void> => undefined;

describeObjectStore("the memory object store", async () => ({
  subject: createMemoryObjectStore(),
  cleanup: noCleanup,
}));

describeCoordinator("the memory coordinator", async () => ({
  subject: createMemoryCoordinator(),
  cleanup: noCleanup,
}));

describeLogDriver("the object-store driver on memory stores", async () => ({
  driver: createObjectStoreDriver({
    objects: createMemoryObjectStore(),
    coordinator: createMemoryCoordinator(),
  }),
  cleanup: noCleanup,
}));

describe("detecting another writer", () => {
  it("fails an integration when the tree state moved underneath it", async () => {
    const coordinator = createMemoryCoordinator();
    const driver = createObjectStoreDriver({
      objects: createMemoryObjectStore(),
      coordinator: { ...coordinator, advanceTreeState: async () => false },
    });
    await expect(
      driver.writeIntegration({ size: 1n, rootHash: new Uint8Array(32), tiles: [], bundles: [] }),
    ).rejects.toThrow("tree state changed while integrating: is another writer running?");
  });

  it("stores tiles, bundles and checkpoints at tlog-tiles keys", async () => {
    const objects = createMemoryObjectStore();
    const driver = createObjectStoreDriver({ objects, coordinator: createMemoryCoordinator() });
    const hashes = new Uint8Array(32).fill(3);
    await driver.writeIntegration({
      size: 1n,
      rootHash: hashes,
      tiles: [{ level: 0, index: 0n, width: 1, hashes }],
      bundles: [{ index: 0n, width: 1, data: Uint8Array.of(0, 1, 9) }],
    });
    await driver.writeCheckpoint(Uint8Array.of(7));
    expect(await objects.get("tile/0/000.p/1")).toEqual(hashes);
    expect(await objects.get("tile/entries/000.p/1")).toEqual(Uint8Array.of(0, 1, 9));
    expect(await objects.get("checkpoint")).toEqual(Uint8Array.of(7));
  });
});

describe("choosing where entry bundles live", () => {
  it("stores bundles under a custom entries path", async () => {
    const objects = createMemoryObjectStore();
    const driver = createObjectStoreDriver({
      objects,
      coordinator: createMemoryCoordinator(),
      entriesPath: ({ index }) => `custom/${index}`,
    });
    await driver.writeIntegration({
      size: 1n,
      rootHash: new Uint8Array(32),
      tiles: [],
      bundles: [{ index: 0n, width: 1, data: Uint8Array.of(5) }],
    });
    expect(await objects.get("custom/0")).toEqual(Uint8Array.of(5));
  });
});
