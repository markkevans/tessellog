import { formatCheckpoint, signNote, type NoteSigner } from "@tessellog/core";
import type { LogDriver } from "./driver.js";

export type PublisherOptions = {
  readonly driver: LogDriver;
  readonly signer: NoteSigner;
  readonly origin: string;
  readonly republishInterval: number;
};

type Publication = { readonly size: bigint; readonly at: number };

export const createPublisher = ({
  driver,
  signer,
  origin,
  republishInterval,
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
      signers: [signer],
    });
    if (!signed.ok) {
      throw new Error(`cannot sign checkpoint: ${signed.error}`);
    }
    await driver.writeCheckpoint(new TextEncoder().encode(signed.value));
    last = { size, at: now };
  };
};
