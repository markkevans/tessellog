const MAX_UINT64 = 2n ** 64n - 1n;

export const isUint64 = (value: bigint): boolean => value >= 0n && value <= MAX_UINT64;
