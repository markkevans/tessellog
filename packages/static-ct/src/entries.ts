import { sha256 } from "@noble/hashes/sha2";
import { concatBytes } from "@noble/hashes/utils";
import { HASH_BYTES, leafHash, type Result } from "@tessellog/core";

type CtEntryCommon = {
  readonly timestamp: bigint;
  readonly certificate: Uint8Array;
  readonly fingerprintsChain: readonly Uint8Array[];
};

export type CtEntry =
  | (CtEntryCommon & { readonly isPrecert: false })
  | (CtEntryCommon & {
      readonly isPrecert: true;
      readonly precertificate: Uint8Array;
      readonly issuerKeyHash: Uint8Array;
    });

export type IndexedCtEntry = { readonly entry: CtEntry; readonly index: bigint };

const X509_ENTRY = 0;
const PRECERT_ENTRY = 1;
const LEAF_INDEX_EXTENSION = 0;
const LEAF_INDEX_BYTES = 5;
const MAX_LEAF_INDEX = 2n ** 40n;

const bigEndian = (value: bigint, bytes: number): Uint8Array =>
  Uint8Array.from({ length: bytes }, (_, i) => Number((value >> BigInt(8 * (bytes - 1 - i))) & 0xffn));

const prefixed = (lengthBytes: number, data: Uint8Array): Uint8Array =>
  concatBytes(bigEndian(BigInt(data.length), lengthBytes), data);

const leafIndexExtensions = (index: bigint): Uint8Array => {
  if (index < 0n || index >= MAX_LEAF_INDEX) {
    throw new RangeError(`leaf index ${index} does not fit in 40 bits`);
  }
  return prefixed(2, concatBytes(Uint8Array.of(LEAF_INDEX_EXTENSION), prefixed(2, bigEndian(index, LEAF_INDEX_BYTES))));
};

const timestampedEntry = (entry: CtEntry, index: bigint): Uint8Array =>
  concatBytes(
    bigEndian(entry.timestamp, 8),
    entry.isPrecert
      ? concatBytes(bigEndian(BigInt(PRECERT_ENTRY), 2), entry.issuerKeyHash)
      : bigEndian(BigInt(X509_ENTRY), 2),
    prefixed(3, entry.certificate),
    leafIndexExtensions(index),
  );

export const encodeTileLeaf = (entry: CtEntry, index: bigint): Uint8Array =>
  concatBytes(
    timestampedEntry(entry, index),
    entry.isPrecert ? prefixed(3, entry.precertificate) : new Uint8Array(),
    prefixed(2, concatBytes(...entry.fingerprintsChain)),
  );

export const merkleTreeLeafHash = (entry: CtEntry, index: bigint): Uint8Array =>
  leafHash(concatBytes(Uint8Array.of(0, 0), timestampedEntry(entry, index)));

export const ctIdentity = (entry: CtEntry): Uint8Array =>
  sha256(entry.isPrecert ? entry.precertificate : entry.certificate);

class MalformedTileLeaf extends Error {
  override readonly name = "MalformedTileLeaf";
}

const cursor = (bytes: Uint8Array) => {
  let offset = 0;
  const take = (count: number): Uint8Array => {
    if (offset + count > bytes.length) {
      throw new MalformedTileLeaf(`truncated TileLeaf at offset ${offset}`);
    }
    offset += count;
    return bytes.slice(offset - count, offset);
  };
  const number = (count: number): bigint => take(count).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
  return {
    take,
    number,
    prefixed: (lengthBytes: number) => take(Number(number(lengthBytes))),
    done: () => offset === bytes.length,
  };
};

const readLeafIndex = (extensions: Uint8Array): bigint => {
  const read = cursor(extensions);
  const type = Number(read.number(1));
  const data = read.prefixed(2);
  if (type !== LEAF_INDEX_EXTENSION || data.length !== LEAF_INDEX_BYTES || !read.done()) {
    throw new MalformedTileLeaf("TileLeaf extensions must hold exactly a leaf_index");
  }
  return cursor(data).number(LEAF_INDEX_BYTES);
};

const readFingerprints = (chain: Uint8Array): readonly Uint8Array[] => {
  if (chain.length % HASH_BYTES !== 0) {
    throw new MalformedTileLeaf("TileLeaf fingerprint chain must hold whole SHA-256 hashes");
  }
  return Array.from({ length: chain.length / HASH_BYTES }, (_, i) => chain.slice(i * HASH_BYTES, (i + 1) * HASH_BYTES));
};

const readX509 = (read: ReturnType<typeof cursor>, timestamp: bigint): IndexedCtEntry => {
  const certificate = read.prefixed(3);
  const index = readLeafIndex(read.prefixed(2));
  const fingerprintsChain = readFingerprints(read.prefixed(2));
  return { entry: { timestamp, isPrecert: false, certificate, fingerprintsChain }, index };
};

const readPrecert = (read: ReturnType<typeof cursor>, timestamp: bigint): IndexedCtEntry => {
  const issuerKeyHash = read.take(HASH_BYTES);
  const certificate = read.prefixed(3);
  const index = readLeafIndex(read.prefixed(2));
  const precertificate = read.prefixed(3);
  const fingerprintsChain = readFingerprints(read.prefixed(2));
  return {
    entry: { timestamp, isPrecert: true, certificate, precertificate, issuerKeyHash, fingerprintsChain },
    index,
  };
};

const ENTRY_READERS: Readonly<Record<number, (read: ReturnType<typeof cursor>, timestamp: bigint) => IndexedCtEntry>> = {
  [X509_ENTRY]: readX509,
  [PRECERT_ENTRY]: readPrecert,
};

const readTileLeaf = (read: ReturnType<typeof cursor>): IndexedCtEntry => {
  const timestamp = read.number(8);
  const entryType = Number(read.number(2));
  const reader = ENTRY_READERS[entryType];
  if (reader === undefined) {
    throw new MalformedTileLeaf(`unknown TileLeaf entry type ${entryType}`);
  }
  return reader(read, timestamp);
};

const readAll = (read: ReturnType<typeof cursor>): readonly IndexedCtEntry[] =>
  read.done() ? [] : [readTileLeaf(read), ...readAll(read)];

export const decodeTileLeaves = (bytes: Uint8Array): Result<readonly IndexedCtEntry[]> => {
  try {
    return { ok: true, value: readAll(cursor(bytes)) };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
};
