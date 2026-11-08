import { isUint64 } from "./uint64.js";

const GROUP_DIGITS = 3;
export const TILE_WIDTH = 256;
const MAX_LEVEL = 63;

type IndexAddress = {
  readonly index: bigint;
  readonly width?: number;
};

export type BundleAddress = {
  readonly index: bigint;
  readonly width: number;
};

export type TileAddress = {
  readonly level: number;
  readonly index: bigint;
  readonly width: number;
};

const isIntegerInRange = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

const assertIndex = (index: bigint): void => {
  if (!isUint64(index)) {
    throw new RangeError(`tile index ${index} is outside uint64`);
  }
};

const assertWidth = (width: number): void => {
  if (!isIntegerInRange(width, 1, TILE_WIDTH)) {
    throw new RangeError(`tile width ${width} must be an integer in 1..${TILE_WIDTH}`);
  }
};

const assertLevel = (level: number): void => {
  if (!isIntegerInRange(level, 0, MAX_LEVEL)) {
    throw new RangeError(`tile level ${level} must be an integer in 0..${MAX_LEVEL}`);
  }
};

const encodeIndex = (index: bigint): string => {
  const digits = index.toString();
  const groupCount = Math.ceil(digits.length / GROUP_DIGITS);
  const padded = digits.padStart(groupCount * GROUP_DIGITS, "0");
  return Array.from({ length: groupCount }, (_, i) => {
    const group = padded.slice(i * GROUP_DIGITS, (i + 1) * GROUP_DIGITS);
    return i < groupCount - 1 ? `x${group}` : group;
  }).join("/");
};

const partialSuffix = (width: number): string =>
  width < TILE_WIDTH ? `.p/${width}` : "";

const encodeAddress = ({ index, width = TILE_WIDTH }: IndexAddress): string => {
  assertIndex(index);
  assertWidth(width);
  return `${encodeIndex(index)}${partialSuffix(width)}`;
};

export const tilePath = ({
  level,
  ...address
}: IndexAddress & { readonly level: number }): string => {
  assertLevel(level);
  return `tile/${level}/${encodeAddress(address)}`;
};

export const entriesPath = (address: IndexAddress): string =>
  `tile/entries/${encodeAddress(address)}`;

export type TileLevel = {
  readonly level: number;
  readonly fullTiles: bigint;
  readonly partialWidth: number;
};

const WIDTH = BigInt(TILE_WIDTH);

const levelsFrom = (hashesAtLevel: bigint, level: number): readonly TileLevel[] =>
  hashesAtLevel === 0n
    ? []
    : [
        {
          level,
          fullTiles: hashesAtLevel / WIDTH,
          partialWidth: Number(hashesAtLevel % WIDTH),
        },
        ...levelsFrom(hashesAtLevel / WIDTH, level + 1),
      ];

export const tileLayout = (size: bigint): readonly TileLevel[] => {
  if (!isUint64(size)) {
    throw new RangeError(`tree size ${size} is outside uint64`);
  }
  return levelsFrom(size, 0);
};
