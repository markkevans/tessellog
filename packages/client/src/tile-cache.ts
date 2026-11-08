import { tilePath } from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";

export const withTileCache = (fetcher: LogFetcher): LogFetcher => {
  let cache: ReadonlyMap<string, Promise<Uint8Array | undefined>> = new Map();
  return {
    ...fetcher,
    readTile: (address) => {
      const path = tilePath(address);
      const cached = cache.get(path);
      if (cached !== undefined) {
        return cached;
      }
      const read = fetcher.readTile(address);
      cache = new Map([...cache, [path, read]]);
      return read;
    },
  };
};
