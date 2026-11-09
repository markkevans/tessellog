import {
  consistencyProofFromTiles,
  policySatisfied,
  type NoteVerifier,
  type Policy,
  type Result,
} from "@tessellog/core";
import { createWitnessClient, type WitnessClient } from "@tessellog/witness";
import type { LogDriver } from "./driver.js";
import { requireTile } from "./integrator.js";

export type WitnessEndpoint = {
  readonly url: string;
  readonly verifier: NoteVerifier;
};

export type WitnessingSettings = {
  readonly policy: Policy;
  readonly witnesses: readonly WitnessEndpoint[];
  readonly timeout: number;
  readonly failOpen: boolean;
  readonly fetch?: typeof fetch | undefined;
};

export type Witnessed = (signedCheckpoint: string, size: bigint) => Promise<string>;

type Cosigned = { readonly verifier: NoteVerifier; readonly lines: string | undefined };

const withinTimeout = <T>(work: Promise<T>, timeout: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeout);
    void work.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });

const ask = async (
  client: WitnessClient,
  verifier: NoteVerifier,
  { checkpoint, size, driver }: { readonly checkpoint: string; readonly size: bigint; readonly driver: LogDriver },
): Promise<Cosigned> => {
  const result = await client
    .addCheckpoint({
      checkpoint,
      size,
      proof: (oldSize) => consistencyProofFromTiles({ oldSize, newSize: size, readTile: requireTile(driver) }),
    })
    .catch((error: Error): Result<string> => ({ ok: false, error: error.message }));
  return { verifier, lines: result.ok ? result.value : undefined };
};

export const witnessedPublication = (settings: WitnessingSettings, driver: LogDriver): Witnessed => {
  const clients = settings.witnesses.map(({ url, verifier }) => ({
    verifier,
    client: createWitnessClient({ url, verifier, fetch: settings.fetch }),
  }));
  return async (checkpoint, size) => {
    const cosigned = await Promise.all(
      clients.map(({ client, verifier }) =>
        withinTimeout(ask(client, verifier, { checkpoint, size, driver }), settings.timeout, {
          verifier,
          lines: undefined,
        }),
      ),
    );
    const answered = cosigned.filter(
      (result): result is Cosigned & { readonly lines: string } => result.lines !== undefined,
    );
    const cosigners = answered.map(({ verifier }) => ({ name: verifier.name, keyId: verifier.keyId }));
    if (!policySatisfied(settings.policy, cosigners) && !settings.failOpen) {
      throw new Error(
        `witness policy not satisfied: cosigned by ${cosigners.map(({ name }) => name).join(", ") || "no witnesses"}`,
      );
    }
    return `${checkpoint}${answered.map(({ lines }) => lines).join("")}`;
  };
};
