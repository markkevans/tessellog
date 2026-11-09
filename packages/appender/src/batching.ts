export type AddResult = {
  readonly index: bigint;
  readonly isDup: boolean;
};

type BatchingSettings = {
  readonly maxSize: number;
  readonly maxAge: number;
};

type Pending = {
  readonly entry: Uint8Array;
  readonly resolve: (result: AddResult) => void;
  readonly reject: (error: unknown) => void;
};

export type Batcher = {
  readonly add: (entry: Uint8Array) => Promise<AddResult>;
  readonly drain: () => Promise<void>;
};

export const createBatcher = ({
  maxSize,
  maxAge,
  sequence,
}: BatchingSettings & {
  readonly sequence: (entries: readonly Uint8Array[]) => Promise<bigint>;
}): Batcher => {
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
    if (batch.length > 0) {
      sequencing = sequencing.then(() => sequenceBatch(batch));
    }
  };

  return {
    add: (entry) =>
      new Promise<AddResult>((resolve, reject) => {
        pending = [...pending, { entry, resolve, reject }];
        if (pending.length >= maxSize) {
          flush();
          return;
        }
        timer ??= setTimeout(flush, maxAge);
      }),
    drain: () => {
      flush();
      return sequencing;
    },
  };
};
