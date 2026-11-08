import type { AddResult } from "./appender.js";

export type BatchingOptions = {
  readonly maxSize?: number;
  readonly maxAge?: number;
};

type Pending = {
  readonly entry: Uint8Array;
  readonly resolve: (result: AddResult) => void;
  readonly reject: (error: unknown) => void;
};

export const DEFAULT_BATCH_MAX_SIZE = 256;
export const DEFAULT_BATCH_MAX_AGE_MS = 250;

export const createBatcher = ({
  maxSize = DEFAULT_BATCH_MAX_SIZE,
  maxAge = DEFAULT_BATCH_MAX_AGE_MS,
  sequence,
}: BatchingOptions & {
  readonly sequence: (entries: readonly Uint8Array[]) => Promise<bigint>;
}): ((entry: Uint8Array) => Promise<AddResult>) => {
  let pending: readonly Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sequencing: Promise<void> = Promise.resolve();

  const sequenceBatch = async (batch: readonly Pending[]): Promise<void> => {
    try {
      const firstIndex = await sequence(batch.map(({ entry }) => entry));
      batch.forEach(({ resolve }, i) => resolve({ index: firstIndex + BigInt(i), isDup: false }));
    } catch (error) {
      batch.forEach(({ reject }) => reject(error));
    }
  };

  const flush = (): void => {
    clearTimeout(timer);
    timer = undefined;
    const batch = pending;
    pending = [];
    sequencing = sequencing.then(() => sequenceBatch(batch));
  };

  return (entry) =>
    new Promise<AddResult>((resolve, reject) => {
      pending = [...pending, { entry, resolve, reject }];
      if (pending.length >= maxSize) {
        flush();
        return;
      }
      timer ??= setTimeout(flush, maxAge);
    });
};
