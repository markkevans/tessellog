import { concatBytes } from "@noble/hashes/utils";

const LENGTH_BYTES = 4;

const lengthPrefix = (length: number): Uint8Array => {
  const prefix = new Uint8Array(LENGTH_BYTES);
  new DataView(prefix.buffer).setUint32(0, length);
  return prefix;
};

export const encodeEntries = (entries: readonly Uint8Array[]): Uint8Array =>
  concatBytes(...entries.flatMap((entry) => [lengthPrefix(entry.length), entry]));

export const decodeEntries = (name: string, bytes: Uint8Array, offset = 0): readonly Uint8Array[] => {
  if (offset === bytes.length) {
    return [];
  }
  const start = offset + LENGTH_BYTES;
  const length = start <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset) : -1;
  if (length < 0 || start + length > bytes.length) {
    throw new Error(`corrupt sequenced batch ${name}`);
  }
  return [bytes.slice(start, start + length), ...decodeEntries(name, bytes, start + length)];
};
