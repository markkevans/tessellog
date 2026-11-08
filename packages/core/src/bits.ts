export const bitLength = (n: bigint): number => (n === 0n ? 0 : n.toString(2).length);

export const onesCount = (n: bigint): number =>
  Array.from(n.toString(2)).filter((digit) => digit === "1").length;

export const trailingZeros = (n: bigint): number => {
  const binary = n.toString(2);
  return binary.length - 1 - binary.lastIndexOf("1");
};

export const isPowerOfTwo = (n: bigint): boolean => (n & (n - 1n)) === 0n;

export const largestPowerOfTwoBelow = (n: bigint): bigint =>
  1n << BigInt(bitLength(n - 1n) - 1);
