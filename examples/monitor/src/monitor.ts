import type { LogClient, StreamedEntry } from "@tessellog/client";
import type { Checkpoint, Result } from "@tessellog/core";

export type Poll = {
  readonly checkpoint: Checkpoint;
  readonly newEntries: bigint;
};

export type Monitor = {
  readonly poll: () => Promise<Result<Poll>>;
  readonly trusted: () => Checkpoint | undefined;
};

export type MonitorOptions = {
  readonly client: LogClient;
  readonly trusted?: Checkpoint;
  readonly onEntry: (entry: StreamedEntry) => Promise<void>;
};

const failure = (error: string): Result<never> => ({ ok: false, error });

export const createMonitor = ({ client, trusted: initial, onEntry }: MonitorOptions): Monitor => {
  let trusted = initial;

  const consistentWithTrusted = async (latest: Checkpoint): Promise<Result<void>> => {
    if (trusted === undefined) {
      return { ok: true, value: undefined };
    }
    const consistent = await client.checkConsistency(trusted, latest);
    return consistent.ok
      ? consistent
      : failure(`log is inconsistent with the trusted checkpoint of size ${trusted.size}: ${consistent.error}`);
  };

  const reportEntries = async (checkpoint: Checkpoint, from: bigint): Promise<Result<void>> => {
    for await (const streamed of client.entries({ checkpoint, from })) {
      if (!streamed.ok) {
        return streamed;
      }
      await onEntry(streamed.value);
    }
    return { ok: true, value: undefined };
  };

  return {
    poll: async () => {
      const latest = await client.latestCheckpoint();
      if (!latest.ok) {
        return latest;
      }
      const { checkpoint } = latest.value;
      const consistent = await consistentWithTrusted(checkpoint);
      if (!consistent.ok) {
        return consistent;
      }
      const from = trusted?.size ?? 0n;
      const reported = await reportEntries(checkpoint, from);
      if (!reported.ok) {
        return reported;
      }
      trusted = checkpoint;
      return { ok: true, value: { checkpoint, newEntries: checkpoint.size - from } };
    },
    trusted: () => trusted,
  };
};
