import {
  consistencyProofFromTiles,
  verifyConsistency,
  type Checkpoint,
  type Result,
} from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { failureFrom, requireTile } from "./tiles.js";

export const checkConsistencyWith =
  (fetcher: LogFetcher) =>
  async (older: Checkpoint, newer: Checkpoint): Promise<Result<void>> => {
    if (newer.size < older.size) {
      return {
        ok: false,
        error: `newer checkpoint of size ${newer.size} is smaller than older checkpoint of size ${older.size}`,
      };
    }
    if (older.size === 0n) {
      return { ok: true, value: undefined };
    }
    return consistencyProofFromTiles({
      oldSize: older.size,
      newSize: newer.size,
      readTile: requireTile(fetcher),
    }).then(
      (proof) =>
        verifyConsistency({
          oldSize: older.size,
          newSize: newer.size,
          oldRoot: older.rootHash,
          newRoot: newer.rootHash,
          proof,
        }),
      failureFrom,
    );
  };
