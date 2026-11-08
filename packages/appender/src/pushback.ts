import type { AddResult } from "./batching.js";
import { PushbackError } from "./errors.js";

export type PushbackOptions = {
  readonly maxOutstanding?: number;
};

export const DEFAULT_MAX_OUTSTANDING = 4096;

export type Pushback = {
  readonly guard: (add: () => Promise<AddResult>) => Promise<AddResult>;
  readonly integrated: (count: bigint) => void;
};

export const createPushback = ({
  maxOutstanding = DEFAULT_MAX_OUTSTANDING,
}: PushbackOptions): Pushback => {
  let outstanding = 0n;
  return {
    guard: async (add) => {
      if (outstanding >= BigInt(maxOutstanding)) {
        throw new PushbackError();
      }
      outstanding += 1n;
      try {
        return await add();
      } catch (error) {
        outstanding -= 1n;
        throw error;
      }
    },
    integrated: (count) => {
      outstanding -= count;
    },
  };
};
