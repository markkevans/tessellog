import { tilePath, type TileAddress } from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";

export const requireTile =
  (fetcher: LogFetcher) =>
  async (address: TileAddress): Promise<Uint8Array> => {
    const tile = await fetcher.readTile(address);
    if (tile === undefined) {
      throw new Error(`missing tile ${tilePath(address)}`);
    }
    return tile;
  };

export const failureFrom = (error: Error): { readonly ok: false; readonly error: string } => ({
  ok: false,
  error: error.message,
});
