import { createAppender, type LogDriver } from "@tessellog/appender";
import {
  encodeBundle,
  inclusionProofFromTiles,
  leafHash,
  openCheckpoint,
  rootHash,
  tilePath,
  verifyInclusion,
} from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { TEST_ORIGIN, testSigner, testVerifier } from "./keys.js";

export type DriverHarness = {
  readonly driver: LogDriver;
  readonly cleanup: () => Promise<void>;
};

export type DriverSetup = () => Promise<DriverHarness>;

const entry = (i: number): Uint8Array => new TextEncoder().encode(`conformance entry ${i}`);

const withDriver = async <T>(
  setup: DriverSetup,
  test: (driver: LogDriver) => Promise<T>,
): Promise<T> => {
  const { driver, cleanup } = await setup();
  try {
    return await test(driver);
  } finally {
    await cleanup();
  }
};

const END_TO_END_TIMEOUT_MS = 20_000;

export const describeLogDriver = (name: string, setup: DriverSetup): void => {
  describe(`${name} conforms to the LogDriver contract`, () => {
    it("assigns contiguous indices across sequenced batches", () =>
      withDriver(setup, async (driver) => {
        expect(await driver.sequence([entry(0), entry(1)])).toBe(0n);
        expect(await driver.sequence([entry(2)])).toBe(2n);
      }));

    it("reads back sequenced entries in index order", () =>
      withDriver(setup, async (driver) => {
        await driver.sequence([entry(0), entry(1)]);
        await driver.sequence([entry(2)]);
        expect(await driver.readSequenced(1n)).toEqual([entry(1), entry(2)]);
      }));

    it("starts with an empty tree", () =>
      withDriver(setup, async (driver) => {
        expect(await driver.readTreeState()).toEqual({ size: 0n, rootHash: rootHash([]) });
      }));

    it("reports missing tiles, bundles and checkpoints as undefined", () =>
      withDriver(setup, async (driver) => {
        expect(await driver.readTile({ level: 0, index: 0n, width: 1 })).toBeUndefined();
        expect(await driver.readEntryBundle({ index: 0n, width: 1 })).toBeUndefined();
        expect(await driver.readCheckpoint()).toBeUndefined();
      }));

    it("persists the tree state, tiles and bundles of an integration", () =>
      withDriver(setup, async (driver) => {
        const hashes = Uint8Array.from({ length: 64 }, (_, i) => i);
        const bundle = encodeBundle([entry(0), entry(1)]);
        const root = rootHash([entry(0), entry(1)].map(leafHash));
        await driver.writeIntegration({
          size: 2n,
          rootHash: root,
          tiles: [{ level: 0, index: 0n, width: 2, hashes }],
          bundles: [{ index: 0n, width: 2, data: bundle }],
        });
        expect(await driver.readTreeState()).toEqual({ size: 2n, rootHash: root });
        expect(await driver.readTile({ level: 0, index: 0n, width: 2 })).toEqual(hashes);
        expect(await driver.readEntryBundle({ index: 0n, width: 2 })).toEqual(bundle);
      }));

    it("keeps a partial tile when a fuller version is written beside it", () =>
      withDriver(setup, async (driver) => {
        const narrow = new Uint8Array(32).fill(1);
        const wider = new Uint8Array(64).fill(2);
        const integrate = (size: bigint, width: number, hashes: Uint8Array) =>
          driver.writeIntegration({
            size,
            rootHash: rootHash([]),
            tiles: [{ level: 0, index: 0n, width, hashes }],
            bundles: [],
          });
        await integrate(1n, 1, narrow);
        await integrate(2n, 2, wider);
        expect(await driver.readTile({ level: 0, index: 0n, width: 1 })).toEqual(narrow);
        expect(await driver.readTile({ level: 0, index: 0n, width: 2 })).toEqual(wider);
      }));

    it("replaces the checkpoint on each write", () =>
      withDriver(setup, async (driver) => {
        await driver.writeCheckpoint(new TextEncoder().encode("first\n"));
        await driver.writeCheckpoint(new TextEncoder().encode("second\n"));
        expect(await driver.readCheckpoint()).toEqual(new TextEncoder().encode("second\n"));
      }));

    it(
      "backs an appender whose published log verifies",
      () =>
        withDriver(setup, async (driver) => {
          const appender = createAppender({
            driver,
            signer: testSigner(),
            batching: { maxSize: 256, maxAge: 0 },
          });
          const added = await Promise.all(
            Array.from({ length: 300 }, async (_, i) => ({
              entry: entry(i),
              index: (await appender.add(entry(i))).index,
            })),
          );
          await appender.shutdown();
          const message = await driver.readCheckpoint();
          const opened =
            message &&
            (await openCheckpoint({ message, origin: TEST_ORIGIN, logVerifier: testVerifier() }));
          if (!opened?.ok) {
            throw new Error("published checkpoint did not open");
          }
          const { size, rootHash: root } = opened.value.checkpoint;
          const readTile = async (address: Parameters<LogDriver["readTile"]>[0]) => {
            const tile = await driver.readTile(address);
            if (tile === undefined) {
              throw new Error(`missing tile ${tilePath(address)}`);
            }
            return tile;
          };
          const verified = await Promise.all(
            added.map(async ({ entry: e, index }) =>
              verifyInclusion({
                leafIndex: index,
                treeSize: size,
                leafHash: leafHash(e),
                proof: await inclusionProofFromTiles({ leafIndex: index, treeSize: size, readTile }),
                rootHash: root,
              }).ok,
            ),
          );
          expect(size).toBe(300n);
          expect(verified.every(Boolean)).toBe(true);
        }),
      END_TO_END_TIMEOUT_MS,
    );
  });
};
