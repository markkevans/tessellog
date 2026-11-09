import { formatCheckpoint, signNote, type NoteSigner } from "@tessellog/core";
import type { LogDriver } from "./driver.js";
import type { Witnessed } from "./witnessing.js";
import { serialTasks } from "./serial-tasks.js";

type PublisherOptions = {
  readonly driver: LogDriver;
  readonly signers: readonly NoteSigner[];
  readonly origin: string;
  readonly republishInterval: number;
  readonly witnessed: Witnessed;
};

type Publication = { readonly size: bigint; readonly at: number; readonly checkpoint: Uint8Array };

type Publisher = {
  readonly publish: (now: number) => Promise<void>;
  readonly latest: () => Publication | undefined;
};

const createPublisher = ({
  driver,
  signers,
  origin,
  republishInterval,
  witnessed,
}: PublisherOptions): Publisher => {
  let last: Publication | undefined;
  const isDue = (size: bigint, now: number): boolean =>
    last === undefined || last.size !== size || now - last.at >= republishInterval;
  const publish = async (now: number): Promise<void> => {
    const { size, rootHash } = await driver.readTreeState();
    if (!isDue(size, now)) {
      return;
    }
    const signed = await signNote({
      text: formatCheckpoint({ origin, size, rootHash, extensions: [] }),
      signers,
    });
    if (!signed.ok) {
      throw new Error(`cannot sign checkpoint: ${signed.error}`);
    }
    const checkpoint = new TextEncoder().encode(await witnessed(signed.value, size));
    await driver.writeCheckpoint(checkpoint);
    last = { size, at: now, checkpoint };
  };
  return { publish, latest: () => last };
};

export type Publishing = {
  readonly stop: () => Promise<void>;
  readonly publishedSize: () => bigint | undefined;
  readonly awaitPublication: (index: bigint) => Promise<Uint8Array>;
};

type Waiter = {
  readonly index: bigint;
  readonly resolve: (checkpoint: Uint8Array) => void;
  readonly reject: (error: Error) => void;
};

const unpublished = (index: bigint): Error => new Error(`appender shut down before index ${index} was published`);

export const startPublishing = ({
  interval,
  onError,
  ...publisher
}: PublisherOptions & {
  readonly interval: number;
  readonly onError: (error: unknown) => void;
}): Publishing => {
  const { publish, latest } = createPublisher(publisher);
  const tasks = serialTasks(onError);
  let waiters: readonly Waiter[] = [];
  let stopped = false;
  const covering = (index: bigint): Uint8Array | undefined => {
    const published = latest();
    return published !== undefined && index < published.size ? published.checkpoint : undefined;
  };
  const settleWaiters = (): void => {
    const remaining = waiters.filter(({ index, resolve }) => {
      const checkpoint = covering(index);
      if (checkpoint === undefined) {
        return true;
      }
      resolve(checkpoint);
      return false;
    });
    waiters = remaining;
  };
  const publishAndSettle = (): void => {
    tasks.run(async () => {
      await publish(Date.now());
      settleWaiters();
    });
  };
  const timer = setInterval(publishAndSettle, interval);
  return {
    stop: async () => {
      clearInterval(timer);
      publishAndSettle();
      await tasks.idle();
      stopped = true;
      waiters.forEach(({ index, reject }) => reject(unpublished(index)));
      waiters = [];
    },
    publishedSize: () => latest()?.size,
    awaitPublication: (index) => {
      if (index < 0n) {
        return Promise.reject(new RangeError(`index must not be negative, got ${index}`));
      }
      const checkpoint = covering(index);
      if (checkpoint !== undefined) {
        return Promise.resolve(checkpoint);
      }
      if (stopped) {
        return Promise.reject(unpublished(index));
      }
      return new Promise((resolve, reject) => {
        waiters = [...waiters, { index, resolve, reject }];
      });
    },
  };
};
