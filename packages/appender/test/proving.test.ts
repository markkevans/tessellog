import {
  inclusionProofFromTiles,
  leafHash,
  openCheckpoint,
  tilePath,
  verifyInclusion,
  type TileAddress,
} from "@tessellog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppender, createMemoryDriver, type Appender } from "../src/index.js";
import { LOG_KEY_NAME, logSigner, logVerifier } from "./fixtures/keys.js";

const CHECKPOINT_INTERVAL_MS = 10_000;
const BATCH_MAX_AGE_MS = 250;
const LARGE_LOG_TIMEOUT_MS = 20_000;

const entries = (count: number): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => new TextEncoder().encode(`entry ${i}`));

type AddedEntry = { readonly entry: Uint8Array; readonly index: bigint };

const publishedLog = async (
  toAdd: readonly Uint8Array[],
): Promise<{ readonly appender: Appender; readonly added: readonly AddedEntry[] }> => {
  const appender = createAppender({ driver: createMemoryDriver(), signer: logSigner() });
  const adding = Promise.all(
    toAdd.map(async (entry) => ({ entry, index: (await appender.add(entry)).index })),
  );
  await vi.advanceTimersByTimeAsync(BATCH_MAX_AGE_MS);
  const added = await adding;
  await vi.waitFor(async () => {
    expect(await appender.reader.integratedSize()).toBe(BigInt(toAdd.length));
  });
  await vi.advanceTimersByTimeAsync(CHECKPOINT_INTERVAL_MS);
  return { appender, added };
};

const requiredTiles =
  (appender: Appender) =>
  async (address: TileAddress): Promise<Uint8Array> => {
    const tile = await appender.reader.readTile(address);
    if (tile === undefined) {
      throw new Error(`missing tile ${tilePath(address)}`);
    }
    return tile;
  };

afterEach(() => {
  vi.useRealTimers();
});

describe("proving entries are in the published log", () => {
  it.each([1, 2, 255, 256, 257, 600])(
    "proves every entry of a %i-entry log from tiles and the signed checkpoint",
    async (count) => {
      vi.useFakeTimers();
      const { appender, added } = await publishedLog(entries(count));
      const message = await appender.reader.readCheckpoint();
      const opened =
        message &&
        (await openCheckpoint({ message, origin: LOG_KEY_NAME, logVerifier: logVerifier() }));
      if (!opened?.ok) {
        throw new Error("checkpoint did not open");
      }
      const { size, rootHash } = opened.value.checkpoint;
      const verified = await Promise.all(
        added.map(async ({ entry, index }) => {
          const proof = await inclusionProofFromTiles({
            leafIndex: index,
            treeSize: size,
            readTile: requiredTiles(appender),
          });
          return verifyInclusion({
            leafIndex: index,
            treeSize: size,
            leafHash: leafHash(entry),
            proof,
            rootHash,
          }).ok;
        }),
      );
      expect(verified.every(Boolean)).toBe(true);
    },
    LARGE_LOG_TIMEOUT_MS,
  );
});
