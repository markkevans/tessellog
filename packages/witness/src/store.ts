export type WitnessedCheckpoint = {
  readonly size: bigint;
  readonly rootHash: Uint8Array;
};

export interface WitnessStore {
  latest(origin: string): Promise<WitnessedCheckpoint | undefined>;
  advance(origin: string, expectedSize: bigint, next: WitnessedCheckpoint): Promise<boolean>;
}

export const createMemoryWitnessStore = (): WitnessStore => {
  const latest = new Map<string, WitnessedCheckpoint>();
  return {
    latest: async (origin) => latest.get(origin),
    advance: async (origin, expectedSize, next) => {
      if ((latest.get(origin)?.size ?? 0n) !== expectedSize) {
        return false;
      }
      latest.set(origin, next);
      return true;
    },
  };
};
