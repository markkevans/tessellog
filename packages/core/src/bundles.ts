import { concatBytes } from "@noble/hashes/utils";
import { failure, success, type Result } from "./result.js";
import { TILE_WIDTH } from "./tiles.js";

const LENGTH_PREFIX_BYTES = 2;
const MAX_ENTRY_BYTES = 0xffff;

type Entries = readonly Uint8Array[];

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
  decoded: Entries,
): Result<Entries> => {
  if (decoded.length > TILE_WIDTH) {
    return failure(`bundle holds more than ${TILE_WIDTH} entries`);
  }
  if (offset === bundle.length) {
    return success(decoded);
  }
  if (offset + LENGTH_PREFIX_BYTES > bundle.length) {
    return failure(`truncated length prefix at offset ${offset}`);
  }
  const length = new DataView(bundle.buffer, bundle.byteOffset).getUint16(offset);
  const start = offset + LENGTH_PREFIX_BYTES;
  const remaining = bundle.length - start;
  if (length > remaining) {
    return failure(
      `entry at offset ${offset} needs ${length} bytes but ${remaining} remain`,
    );
  }
  return decodeFrom(bundle, start + length, [
    ...decoded,
    bundle.slice(start, start + length),
  ]);
};

export const decodeBundle = (bundle: Uint8Array): Result<Entries> =>
  decodeFrom(bundle, 0, []);
