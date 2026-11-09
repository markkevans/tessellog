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

type Publication = { readonly size: bigint; readonly at: number };

type Publisher = {
  readonly publish: (now: number) => Promise<void>;
  readonly publishedSize: () => bigint | undefined;
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
    await driver.writeCheckpoint(new TextEncoder().encode(await witnessed(signed.value, size)));
    last = { size, at: now };
  };
  return { publish, publishedSize: () => last?.size };
};

export type Publishing = {
  readonly stop: () => Promise<void>;
  readonly publishedSize: () => bigint | undefined;
};

export const startPublishing = ({
  interval,
  onError,
  ...publisher
}: PublisherOptions & {
  readonly interval: number;
  readonly onError: (error: unknown) => void;
}): Publishing => {
  const { publish, publishedSize } = createPublisher(publisher);
  const tasks = serialTasks(onError);
  const timer = setInterval(() => {
    tasks.run(() => publish(Date.now()));
  }, interval);
  return {
    stop: async () => {
      clearInterval(timer);
      tasks.run(() => publish(Date.now()));
      await tasks.idle();
    },
    publishedSize,
  };
};
