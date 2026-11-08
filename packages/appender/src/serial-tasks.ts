export type SerialTasks = {
  readonly run: (task: () => Promise<void>) => void;
  readonly idle: () => Promise<void>;
};

export const serialTasks = (onError: (error: unknown) => void): SerialTasks => {
  let tail: Promise<void> = Promise.resolve();
  return {
    run: (task) => {
      tail = tail.then(task).catch(onError);
    },
    idle: () => tail,
  };
};
