const GROUP_DIGITS = 3;
const TILE_WIDTH = 256;

type TileAddress = {
  readonly index: bigint;
  readonly width?: number;
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

const encodeAddress = ({ index, width = TILE_WIDTH }: TileAddress): string =>
  `${encodeIndex(index)}${partialSuffix(width)}`;

export const tilePath = ({
  level,
  ...address
}: TileAddress & { readonly level: number }): string =>
  `tile/${level}/${encodeAddress(address)}`;

export const entriesPath = (address: TileAddress): string =>
  `tile/entries/${encodeAddress(address)}`;
