import {
  openCheckpoint,
  type NoteVerifier,
  type OpenedCheckpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";

export type LogClientOptions = {
  readonly fetcher: LogFetcher;
  readonly origin: string;
  readonly logVerifier: NoteVerifier;
  readonly otherVerifiers?: readonly NoteVerifier[];
};

export type LogClient = {
  readonly latestCheckpoint: () => Promise<Result<OpenedCheckpoint>>;
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
});
