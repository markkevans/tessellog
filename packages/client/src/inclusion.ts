import {
  inclusionProofFromTiles,
  leafHash,
  verifyInclusion,
  type Checkpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { failureFrom, requireTile } from "./tiles.js";

export type InclusionClaim = {
  readonly entry: Uint8Array;
  readonly index: bigint;
  readonly checkpoint: Checkpoint;
};

export const proveInclusionWith =
  (fetcher: LogFetcher) =>
  async ({ entry, index, checkpoint: { size, rootHash } }: InclusionClaim): Promise<Result<void>> => {
    if (index >= size) {
      return { ok: false, error: `index ${index} is outside a checkpoint of size ${size}` };
    }
    return inclusionProofFromTiles({
      leafIndex: index,
      treeSize: size,
      readTile: requireTile(fetcher),
    }).then(
      (proof) =>
        verifyInclusion({ leafIndex: index, treeSize: size, leafHash: leafHash(entry), proof, rootHash }),
      failureFrom,
    );
  };
