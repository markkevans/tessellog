import { mkdir } from "node:fs/promises";
import { concatBytes } from "@noble/hashes/utils";
import type { AntispamStore, FollowedEntry } from "@tessellog/appender";
import { HASH_BYTES, toHex } from "@tessellog/core";
import { logFiles } from "./files.js";

const SEGMENTS_DIRECTORY = "segments";
const INDEX_BYTES = 8;
const RECORD_BYTES = HASH_BYTES + INDEX_BYTES;
const SIZE_DIGITS = 20;

const encodeRecord = ({ identity, index }: FollowedEntry): Uint8Array => {
  const indexBytes = new Uint8Array(INDEX_BYTES);
  new DataView(indexBytes.buffer).setBigUint64(0, index);
  return concatBytes(identity, indexBytes);
};

const decodeSegment = (name: string, bytes: Uint8Array): readonly FollowedEntry[] => {
  if (bytes.length % RECORD_BYTES !== 0) {
    throw new Error(`corrupt antispam segment ${name}: ${bytes.length} bytes`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  return Array.from({ length: bytes.length / RECORD_BYTES }, (_, i) => ({
    identity: bytes.slice(i * RECORD_BYTES, i * RECORD_BYTES + HASH_BYTES),
    index: view.getBigUint64(i * RECORD_BYTES + HASH_BYTES),
  }));
};

const segmentPath = (followedSize: bigint): string =>
  `${SEGMENTS_DIRECTORY}/${followedSize.toString().padStart(SIZE_DIGITS, "0")}`;

export const openPosixAntispamStore = async ({
  root,
}: {
  readonly root: string;
}): Promise<AntispamStore> => {
  await mkdir(root, { recursive: true });
  const files = logFiles(root);
  const names = await files.list(SEGMENTS_DIRECTORY);
  const segments = await Promise.all(
    names.map(async (name) =>
      decodeSegment(name, await files.readExisting(`${SEGMENTS_DIRECTORY}/${name}`)),
    ),
  );
  const indices = new Map<string, bigint>();
  const remember = (entries: readonly FollowedEntry[]): void => {
    entries
      .map(({ identity, index }) => ({ key: toHex(identity), index }))
      .filter(({ key }) => !indices.has(key))
      .forEach(({ key, index }) => indices.set(key, index));
  };
  segments.forEach(remember);
  let followed = BigInt(names.at(-1) ?? "0");
  return {
    lookup: async (identity) => indices.get(toHex(identity)),
    followedSize: async () => followed,
    record: async (entries, followedSize) => {
      await files.write(segmentPath(followedSize), concatBytes(...entries.map(encodeRecord)));
      remember(entries);
      followed = followedSize;
    },
  };
};
