import { decodeBase64, encodeBase64 } from "./base64.js";
import { HASH_BYTES } from "./merkle.js";
import { hasControlCharacters } from "./note-format.js";
import { failure, success, type Result } from "./result.js";
import { isUint64 } from "./uint64.js";

const DECIMAL_WITHOUT_LEADING_ZEROS = /^(0|[1-9][0-9]*)$/;

export type Checkpoint = {
  readonly origin: string;
  readonly size: bigint;
  readonly rootHash: Uint8Array;
  readonly extensions: readonly string[];
};

const isSingleLine = (text: string): boolean =>
  text !== "" && !text.includes("\n") && !hasControlCharacters(text);

export const formatCheckpoint = ({
  origin,
  size,
  rootHash,
  extensions,
}: Checkpoint): string => {
  if (!isSingleLine(origin)) {
    throw new RangeError("checkpoint origin must be a single non-empty line");
  }
  if (!isUint64(size)) {
    throw new RangeError(`checkpoint size ${size} is outside uint64`);
  }
  if (rootHash.length !== HASH_BYTES) {
    throw new RangeError(`checkpoint root hash must be ${HASH_BYTES} bytes`);
  }
  if (!extensions.every(isSingleLine)) {
    throw new RangeError("checkpoint extensions must be single non-empty lines");
  }
  return [origin, size.toString(), encodeBase64(rootHash), ...extensions]
    .map((line) => `${line}\n`)
    .join("");
};

const parseSize = (text: string): bigint | undefined => {
  if (!DECIMAL_WITHOUT_LEADING_ZEROS.test(text)) {
    return undefined;
  }
  const size = BigInt(text);
  return isUint64(size) ? size : undefined;
};

export const parseCheckpoint = (text: string): Result<Checkpoint> => {
  if (hasControlCharacters(text) || !text.endsWith("\n")) {
    return failure("checkpoint must be newline-terminated text without control characters");
  }
  const [origin = "", sizeText = "", hashText = "", ...extensions] = text
    .slice(0, -1)
    .split("\n");
  if (origin === "") {
    return failure("checkpoint origin is empty");
  }
  const size = parseSize(sizeText);
  if (size === undefined) {
    return failure(`checkpoint size ${sizeText} is not a canonical uint64`);
  }
  const rootHash = decodeBase64(hashText);
  if (rootHash === undefined || rootHash.length !== HASH_BYTES) {
    return failure("checkpoint root hash is not canonical base64 of 32 bytes");
  }
  if (extensions.includes("")) {
    return failure("checkpoint extension lines must not be empty");
  }
  return success({ origin, size, rootHash, extensions });
};
