import { concatBytes } from "@noble/hashes/utils";
import { TILE_WIDTH } from "./tiles.js";

const LENGTH_PREFIX_BYTES = 2;
const MAX_ENTRY_BYTES = 0xffff;

export type DecodedBundle =
  | { readonly ok: true; readonly entries: readonly Uint8Array[] }
  | { readonly ok: false; readonly error: string };

const lengthPrefixed = (entry: Uint8Array): Uint8Array => {
  if (entry.length > MAX_ENTRY_BYTES) {
    throw new RangeError(
      `entry of ${entry.length} bytes exceeds ${MAX_ENTRY_BYTES}`,
    );
  }
  return concatBytes(Uint8Array.of(entry.length >> 8, entry.length & 0xff), entry);
};

export const encodeBundle = (entries: readonly Uint8Array[]): Uint8Array => {
  if (entries.length > TILE_WIDTH) {
    throw new RangeError(`bundle of ${entries.length} entries exceeds ${TILE_WIDTH}`);
  }
  return concatBytes(...entries.map(lengthPrefixed));
};

const decodeFrom = (
  bundle: Uint8Array,
  offset: number,
  decoded: readonly Uint8Array[],
): DecodedBundle => {
  if (decoded.length > TILE_WIDTH) {
    return { ok: false, error: `bundle holds more than ${TILE_WIDTH} entries` };
  }
  if (offset === bundle.length) {
    return { ok: true, entries: decoded };
  }
  if (offset + LENGTH_PREFIX_BYTES > bundle.length) {
    return { ok: false, error: `truncated length prefix at offset ${offset}` };
  }
  const length = new DataView(bundle.buffer, bundle.byteOffset).getUint16(offset);
  const start = offset + LENGTH_PREFIX_BYTES;
  const remaining = bundle.length - start;
  if (length > remaining) {
    return {
      ok: false,
      error: `entry at offset ${offset} needs ${length} bytes but ${remaining} remain`,
    };
  }
  return decodeFrom(bundle, start + length, [
    ...decoded,
    bundle.slice(start, start + length),
  ]);
};

export const decodeBundle = (bundle: Uint8Array): DecodedBundle =>
  decodeFrom(bundle, 0, []);
