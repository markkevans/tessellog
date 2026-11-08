const GROUP_DIGITS = 3;
const TILE_WIDTH = 256;
const MAX_LEVEL = 63;
const MAX_INDEX = 2n ** 64n - 1n;

type TileAddress = {
  readonly index: bigint;
  readonly width?: number;
};

const isIntegerInRange = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

const assertValidAddress = ({ index, width = TILE_WIDTH }: TileAddress): void => {
  if (index < 0n || index > MAX_INDEX) {
    throw new RangeError(`tile index ${index} is outside uint64`);
  }
  if (!isIntegerInRange(width, 1, TILE_WIDTH)) {
    throw new RangeError(`tile width ${width} must be an integer in 1..${TILE_WIDTH}`);
  }
};

const assertValidLevel = (level: number): void => {
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

const encodeAddress = (address: TileAddress): string => {
  assertValidAddress(address);
  const { index, width = TILE_WIDTH } = address;
  return `${encodeIndex(index)}${partialSuffix(width)}`;
};

export const tilePath = ({
  level,
  ...address
}: TileAddress & { readonly level: number }): string => {
  assertValidLevel(level);
  return `tile/${level}/${encodeAddress(address)}`;
};

export const entriesPath = (address: TileAddress): string =>
  `tile/entries/${encodeAddress(address)}`;
