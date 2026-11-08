const GROUP_DIGITS = 3;

const encodeIndex = (index: bigint): string => {
  const digits = index.toString();
  const groupCount = Math.ceil(digits.length / GROUP_DIGITS);
  const padded = digits.padStart(groupCount * GROUP_DIGITS, "0");
  return Array.from({ length: groupCount }, (_, i) => {
    const group = padded.slice(i * GROUP_DIGITS, (i + 1) * GROUP_DIGITS);
    return i < groupCount - 1 ? `x${group}` : group;
  }).join("/");
};

export const tilePath = ({
  level,
  index,
}: {
  readonly level: number;
  readonly index: bigint;
}): string => `tile/${level}/${encodeIndex(index)}`;
