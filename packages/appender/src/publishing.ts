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

const createPublisher = ({
  driver,
  signers,
  origin,
  republishInterval,
  witnessed,
}: PublisherOptions): ((now: number) => Promise<void>) => {
  let last: Publication | undefined;
  const isDue = (size: bigint, now: number): boolean =>
    last === undefined || last.size !== size || now - last.at >= republishInterval;
  return async (now) => {
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
};

export type Publishing = {
  readonly stop: () => Promise<void>;
};

export const startPublishing = ({
  interval,
  onError,
  ...publisher
}: PublisherOptions & {
  readonly interval: number;
  readonly onError: (error: unknown) => void;
}): Publishing => {
  const publish = createPublisher(publisher);
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
  };
};
