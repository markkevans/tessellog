import {
  openCheckpoint,
  policySatisfied,
  sameKey,
  type Checkpoint,
  type NoteVerifier,
  type OpenedCheckpoint,
  type Policy,
  type Result,
} from "@tessellog/core";
import { checkConsistencyWith } from "./consistency.js";
import type { LogFetcher } from "./fetcher.js";
import { proveInclusionWith, type InclusionClaim } from "./inclusion.js";
import { streamEntries, type EntryRange, type StreamedEntry } from "./streaming.js";

export type LogClientOptions = {
  readonly fetcher: LogFetcher;
  readonly origin: string;
  readonly logVerifier: NoteVerifier;
  readonly otherVerifiers?: readonly NoteVerifier[];
  readonly witnessPolicy?: Policy;
};

export type LogClient = {
  readonly latestCheckpoint: () => Promise<Result<OpenedCheckpoint>>;
  readonly proveInclusion: (claim: InclusionClaim) => Promise<Result<void>>;
  readonly checkConsistency: (older: Checkpoint, newer: Checkpoint) => Promise<Result<void>>;
  readonly entries: (range: EntryRange) => AsyncIterable<Result<StreamedEntry>>;
};

const meetsPolicy = (
  opened: OpenedCheckpoint,
  policy: Policy | undefined,
  logVerifier: NoteVerifier,
): Result<OpenedCheckpoint> => {
  if (policy === undefined) {
    return { ok: true, value: opened };
  }
  const cosigners = opened.note.verifiedSignatures.filter((signature) => !sameKey(signature, logVerifier));
  return policySatisfied(policy, cosigners)
    ? { ok: true, value: opened }
    : {
        ok: false,
        error: `checkpoint does not satisfy the witness policy: cosigned by ${
          cosigners.map(({ name }) => name).join(", ") || "no witnesses"
        }`,
      };
};

export const createLogClient = ({
  fetcher,
  origin,
  logVerifier,
  otherVerifiers = [],
  witnessPolicy,
}: LogClientOptions): LogClient => ({
  latestCheckpoint: async () => {
    const message = await fetcher.readCheckpoint();
    if (message === undefined) {
      return { ok: false, error: "log has no published checkpoint" };
    }
    const witnessVerifiers = witnessPolicy?.witnesses.map(({ verifier }) => verifier) ?? [];
    const opened = await openCheckpoint({
      message,
      origin,
      logVerifier,
      otherVerifiers: [...otherVerifiers, ...witnessVerifiers],
    });
    return opened.ok ? meetsPolicy(opened.value, witnessPolicy, logVerifier) : opened;
  },
  proveInclusion: proveInclusionWith(fetcher),
  checkConsistency: checkConsistencyWith(fetcher),
  entries: (range) => streamEntries(fetcher, range),
});
