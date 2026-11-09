import { sha256 } from "@noble/hashes/sha2";
import {
  consistencyProofFromTiles,
  leafHash,
  openCheckpoint,
  rootHash,
  verifyConsistency,
  type BundleAddress,
} from "@tessellog/core";
import { describe, expect, it } from "vitest";
import {
  createAppender,
  createMemoryAntispamStore,
  createMemoryDriver,
  createMigrationTarget,
  type LogDriver,
} from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";

const entries = (count: number): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => new TextEncoder().encode(`source entry ${i}`));

type Source = {
  readonly driver: LogDriver;
  readonly size: bigint;
  readonly root: Uint8Array;
};

const sourceLog = async (added: readonly Uint8Array[]): Promise<Source> => {
  const driver = createMemoryDriver();
  const appender = createAppender({ driver, signer: logSigner(), batching: { maxSize: 256, maxAge: 0 } });
  await Promise.all(added.map((entry) => appender.add(entry)));
  await appender.shutdown();
  const message = await driver.readCheckpoint();
  const opened = message && (await openCheckpoint({ message, origin: LOG_KEY_NAME, logVerifier: logVerifier() }));
  if (!opened?.ok) {
    throw new Error("source checkpoint did not open");
  }
  return { driver, size: opened.value.checkpoint.size, root: opened.value.checkpoint.rootHash };
};

const bundlesOf = (source: Source) => (address: BundleAddress) => source.driver.readEntryBundle(address);

describe("migrating a log into a new driver", () => {
  it("imports every entry and reproduces the source root", async () => {
    const added = entries(600);
    const source = await sourceLog(added);
    const target = createMemoryDriver();
    const result = await createMigrationTarget({ driver: target }).migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: source.size,
      sourceRoot: source.root,
    });
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await target.readTreeState()).toEqual({ size: 600n, rootHash: rootHash(added.map(leafHash)) });
  });

  it("publishes no checkpoint, so only the source stays canonical", async () => {
    const source = await sourceLog(entries(5));
    const target = createMemoryDriver();
    await createMigrationTarget({ driver: target }).migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: source.size,
      sourceRoot: source.root,
    });
    expect(await target.readCheckpoint()).toBeUndefined();
  });

  it("fails when the migrated root does not match the source's", async () => {
    const source = await sourceLog(entries(5));
    expect(
      await createMigrationTarget({ driver: createMemoryDriver() }).migrate({
        readEntryBundle: bundlesOf(source),
        sourceSize: source.size,
        sourceRoot: new Uint8Array(32),
      }),
    ).toEqual({ ok: false, error: "migrated root does not match the source root at size 5" });
  });

  it("resumes a migration that stopped part way", async () => {
    const added = entries(600);
    const source = await sourceLog(added);
    const target = createMemoryDriver();
    const migration = createMigrationTarget({ driver: target });
    await migration.migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: 300n,
      sourceRoot: rootHash(added.slice(0, 300).map(leafHash)),
    });
    const result = await migration.migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: source.size,
      sourceRoot: source.root,
    });
    expect(result.ok).toBe(true);
    expect((await target.readTreeState()).size).toBe(600n);
  });

  it("falls back to the full bundle when the source's partial has been collected", async () => {
    const added = entries(600);
    const source = await sourceLog(added);
    await source.driver.collectGarbage(source.size);
    const result = await createMigrationTarget({ driver: createMemoryDriver() }).migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: 300n,
      sourceRoot: rootHash(added.slice(0, 300).map(leafHash)),
    });
    expect(result.ok).toBe(true);
  });

  it("fails when the source is missing a bundle", async () => {
    expect(
      await createMigrationTarget({ driver: createMemoryDriver() }).migrate({
        readEntryBundle: async () => undefined,
        sourceSize: 5n,
        sourceRoot: new Uint8Array(32),
      }),
    ).toEqual({ ok: false, error: "missing entry bundle tile/entries/000.p/5" });
  });

  it("populates an antispam store with the migrated entries", async () => {
    const added = entries(10);
    const source = await sourceLog(added);
    const store = createMemoryAntispamStore();
    await createMigrationTarget({ driver: createMemoryDriver(), antispam: store }).migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: source.size,
      sourceRoot: source.root,
    });
    expect(await store.lookup(sha256(added[7] ?? new Uint8Array()))).toBe(7n);
    expect(await store.followedSize()).toBe(10n);
  });
});

describe("handling unusual migrations", () => {
  it("fails when the source serves a corrupt bundle", async () => {
    expect(
      await createMigrationTarget({ driver: createMemoryDriver() }).migrate({
        readEntryBundle: async () => Uint8Array.of(0x00),
        sourceSize: 5n,
        sourceRoot: new Uint8Array(32),
      }),
    ).toEqual({
      ok: false,
      error: "corrupt entry bundle tile/entries/000.p/5: truncated length prefix at offset 0",
    });
  });

  it("treats re-running a completed migration as harmless", async () => {
    const source = await sourceLog(entries(5));
    const migration = createMigrationTarget({ driver: createMemoryDriver() });
    const run = () =>
      migration.migrate({ readEntryBundle: bundlesOf(source), sourceSize: source.size, sourceRoot: source.root });
    await run();
    expect(await run()).toEqual({ ok: true, value: undefined });
  });
});

describe("taking over a migrated log", () => {
  it("lets an appender continue the log consistently with the source", async () => {
    const source = await sourceLog(entries(300));
    const target = createMemoryDriver();
    await createMigrationTarget({ driver: target }).migrate({
      readEntryBundle: bundlesOf(source),
      sourceSize: source.size,
      sourceRoot: source.root,
    });
    const appender = createAppender({ driver: target, signer: logSigner(), batching: { maxSize: 256, maxAge: 0 } });
    const indices = await Promise.all(
      Array.from({ length: 10 }, async (_, i) => (await appender.add(new TextEncoder().encode(`after ${i}`))).index),
    );
    await appender.shutdown();
    const message = await target.readCheckpoint();
    const opened = message && (await openCheckpoint({ message, origin: LOG_KEY_NAME, logVerifier: logVerifier() }));
    if (!opened?.ok) {
      throw new Error("target checkpoint did not open");
    }
    const { size, rootHash: newRoot } = opened.value.checkpoint;
    const proof = await consistencyProofFromTiles({
      oldSize: source.size,
      newSize: size,
      readTile: async (address) => {
        const tile = await target.readTile(address);
        if (tile === undefined) {
          throw new Error("missing tile");
        }
        return tile;
      },
    });
    expect([...indices].sort((a, b) => Number(a - b))[0]).toBe(300n);
    expect(
      verifyConsistency({ oldSize: source.size, newSize: size, oldRoot: source.root, newRoot, proof }).ok,
    ).toBe(true);
  });
});
