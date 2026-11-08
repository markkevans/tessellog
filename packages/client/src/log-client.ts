import {
  openCheckpoint,
  type Checkpoint,
  type NoteVerifier,
  type OpenedCheckpoint,
  type Result,
} from "@tessellog/core";
import { checkConsistencyWith } from "./consistency.js";
import type { LogFetcher } from "./fetcher.js";
import { proveInclusionWith, type InclusionClaim } from "./inclusion.js";

export type LogClientOptions = {
  readonly fetcher: LogFetcher;
  readonly origin: string;
  readonly logVerifier: NoteVerifier;
  readonly otherVerifiers?: readonly NoteVerifier[];
};

export type LogClient = {
  readonly latestCheckpoint: () => Promise<Result<OpenedCheckpoint>>;
  readonly proveInclusion: (claim: InclusionClaim) => Promise<Result<void>>;
  readonly checkConsistency: (older: Checkpoint, newer: Checkpoint) => Promise<Result<void>>;
};

export const createLogClient = ({
  fetcher,
  origin,
  logVerifier,
  otherVerifiers = [],
}: LogClientOptions): LogClient => ({
  latestCheckpoint: async () => {
    const message = await fetcher.readCheckpoint();
    if (message === undefined) {
      return { ok: false, error: "log has no published checkpoint" };
    }
    return openCheckpoint({ message, origin, logVerifier, otherVerifiers });
  },
  proveInclusion: proveInclusionWith(fetcher),
  checkConsistency: checkConsistencyWith(fetcher),
});
