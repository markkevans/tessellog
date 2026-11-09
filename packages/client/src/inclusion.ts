import {
  inclusionProofFromTiles,
  verifyInclusion,
  type Checkpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import type { ClientLayout } from "./layouts.js";
import { failureFrom, requireTile } from "./tiles.js";

export type InclusionClaim = {
  readonly entry: Uint8Array;
  readonly index: bigint;
  readonly checkpoint: Checkpoint;
};

export const proveInclusionWith =
  (fetcher: LogFetcher, layout: ClientLayout) =>
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
        verifyInclusion({
          leafIndex: index,
          treeSize: size,
          leafHash: layout.leafHash(entry, index),
          proof,
          rootHash,
        }),
      failureFrom,
    );
  };
