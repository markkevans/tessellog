import { mkdir } from "node:fs/promises";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, concatBytes } from "@noble/hashes/utils";
import { HASH_BYTES } from "@tessellog/core";
import type { WitnessedCheckpoint, WitnessStore } from "@tessellog/witness";
import { logFiles } from "./files.js";
import { lockDirectory } from "./lock.js";

const CHECKPOINTS_DIRECTORY = "checkpoints";
const SIZE_BYTES = 8;
const HEADER_BYTES = SIZE_BYTES + HASH_BYTES;

export type PosixWitnessStore = WitnessStore & {
  readonly close: () => Promise<void>;
};

const recordPath = (origin: string): string =>
  `${CHECKPOINTS_DIRECTORY}/${bytesToHex(sha256(new TextEncoder().encode(origin)))}`;

const encodeRecord = (origin: string, { size, rootHash }: WitnessedCheckpoint): Uint8Array => {
  const sizeBytes = new Uint8Array(SIZE_BYTES);
  new DataView(sizeBytes.buffer).setBigUint64(0, size);
  return concatBytes(sizeBytes, rootHash, new TextEncoder().encode(origin));
};

const decodeRecord = (origin: string, bytes: Uint8Array): WitnessedCheckpoint => {
  if (bytes.length < HEADER_BYTES || new TextDecoder().decode(bytes.slice(HEADER_BYTES)) !== origin) {
    throw new Error(`corrupt witness record for ${origin}`);
  }
  return {
    size: new DataView(bytes.buffer, bytes.byteOffset).getBigUint64(0),
    rootHash: bytes.slice(SIZE_BYTES, HEADER_BYTES),
  };
};

export const openPosixWitnessStore = async ({ root }: { readonly root: string }): Promise<PosixWitnessStore> => {
  await mkdir(root, { recursive: true });
  const lock = await lockDirectory(root, "witness directory");
  const files = logFiles(root);
  let queue: Promise<unknown> = Promise.resolve();
  const serially = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };
  const latest = async (origin: string): Promise<WitnessedCheckpoint | undefined> => {
    const stored = await files.read(recordPath(origin));
    return stored === undefined ? undefined : decodeRecord(origin, stored);
  };
  return {
    latest,
    advance: (origin, expectedSize, next) =>
      serially(async () => {
        const current = await latest(origin);
        if ((current?.size ?? 0n) !== expectedSize) {
          return false;
        }
        await files.write(recordPath(origin), encodeRecord(origin, next));
        return true;
      }),
    close: lock.release,
  };
};
