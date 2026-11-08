import { concatBytes } from "@noble/hashes/utils";
import type { TreeState } from "@tessellog/appender";
import { formatCheckpoint, parseCheckpoint, rootHash } from "@tessellog/core";
import type { LogFiles } from "./files.js";

const SEQUENCED_DIRECTORY = ".state/sequenced";
const TREE_STATE_PATH = ".state/tree";
const TREE_STATE_ORIGIN = "tessellog tree state";
const LENGTH_BYTES = 4;
const INDEX_DIGITS = 20;

export type SequencedBatch = {
  readonly firstIndex: bigint;
  readonly entries: readonly Uint8Array[];
};

const lengthPrefixed = (entry: Uint8Array): Uint8Array => {
  const length = new Uint8Array(LENGTH_BYTES);
  new DataView(length.buffer).setUint32(0, entry.length);
  return concatBytes(length, entry);
};

const decodeBatch = (name: string, bytes: Uint8Array, offset = 0): readonly Uint8Array[] => {
  if (offset === bytes.length) {
    return [];
  }
  const start = offset + LENGTH_BYTES;
  const length = start <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset) : -1;
  if (length < 0 || start + length > bytes.length) {
    throw new Error(`corrupt sequenced batch ${name}`);
  }
  return [bytes.slice(start, start + length), ...decodeBatch(name, bytes, start + length)];
};

const batchPath = (firstIndex: bigint): string =>
  `${SEQUENCED_DIRECTORY}/${firstIndex.toString().padStart(INDEX_DIGITS, "0")}`;

export const writeBatch = (files: LogFiles, batch: SequencedBatch): Promise<void> =>
  files.write(batchPath(batch.firstIndex), concatBytes(...batch.entries.map(lengthPrefixed)));

export const readBatches = async (files: LogFiles): Promise<readonly SequencedBatch[]> =>
  Promise.all(
    (await files.list(SEQUENCED_DIRECTORY)).map(async (name) => ({
      firstIndex: BigInt(name),
      entries: decodeBatch(name, await files.readExisting(`${SEQUENCED_DIRECTORY}/${name}`)),
    })),
  );

export const writeTreeState = (files: LogFiles, { size, rootHash: root }: TreeState): Promise<void> =>
  files.write(
    TREE_STATE_PATH,
    new TextEncoder().encode(
      formatCheckpoint({ origin: TREE_STATE_ORIGIN, size, rootHash: root, extensions: [] }),
    ),
  );

export const readTreeState = async (files: LogFiles): Promise<TreeState> => {
  const stored = await files.read(TREE_STATE_PATH);
  if (stored === undefined) {
    return { size: 0n, rootHash: rootHash([]) };
  }
  const parsed = parseCheckpoint(new TextDecoder().decode(stored));
  if (!parsed.ok || parsed.value.origin !== TREE_STATE_ORIGIN) {
    throw new Error(`corrupt tree state: ${parsed.ok ? "unexpected origin" : parsed.error}`);
  }
  return { size: parsed.value.size, rootHash: parsed.value.rootHash };
};
