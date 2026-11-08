import {
  inclusionProofFromTiles,
  leafHash,
  openCheckpoint,
  verifyInclusion,
  type Checkpoint,
  type NoteVerifier,
  type OpenedCheckpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { failureFrom, requireTile } from "./tiles.js";

export type LogClientOptions = {
  readonly fetcher: LogFetcher;
  readonly origin: string;
  readonly logVerifier: NoteVerifier;
  readonly otherVerifiers?: readonly NoteVerifier[];
};

export type InclusionClaim = {
  readonly entry: Uint8Array;
  readonly index: bigint;
  readonly checkpoint: Checkpoint;
};

export type LogClient = {
  readonly latestCheckpoint: () => Promise<Result<OpenedCheckpoint>>;
  readonly proveInclusion: (claim: InclusionClaim) => Promise<Result<void>>;
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
  proveInclusion: async ({ entry, index, checkpoint: { size, rootHash } }) => {
    if (index >= size) {
      return { ok: false, error: `index ${index} is outside a checkpoint of size ${size}` };
    }
    return inclusionProofFromTiles({ leafIndex: index, treeSize: size, readTile: requireTile(fetcher) }).then(
      (proof) =>
        verifyInclusion({ leafIndex: index, treeSize: size, leafHash: leafHash(entry), proof, rootHash }),
      failureFrom,
    );
  },
});
