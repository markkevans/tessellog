import { tilePath } from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";

export const withTileCache = (fetcher: LogFetcher): LogFetcher => {
  const cache = new Map<string, Promise<Uint8Array | undefined>>();
  return {
    ...fetcher,
    readTile: (address) => {
      const path = tilePath(address);
      const cached = cache.get(path);
      if (cached !== undefined) {
        return cached;
      }
      const read = fetcher.readTile(address);
      cache.set(path, read);
      return read;
    },
  };
};
