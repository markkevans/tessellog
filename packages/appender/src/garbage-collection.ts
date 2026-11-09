import type { LogDriver } from "./driver.js";
import { serialTasks } from "./serial-tasks.js";

export type GarbageCollection = {
  readonly stop: () => Promise<void>;
};

export const startGarbageCollection = ({
  driver,
  interval,
  publishedSize,
  onError,
}: {
  readonly driver: LogDriver;
  readonly interval: number;
  readonly publishedSize: () => bigint | undefined;
  readonly onError: (error: unknown) => void;
}): GarbageCollection => {
  if (interval === 0) {
    return { stop: async () => undefined };
  }
  const tasks = serialTasks(onError);
  const timer = setInterval(() => {
    const size = publishedSize();
    if (size !== undefined) {
      tasks.run(() => driver.collectGarbage(size));
    }
  }, interval);
  return {
    stop: async () => {
      clearInterval(timer);
      await tasks.idle();
    },
  };
};
