import { tilePath } from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { tlogTilesClientLayout, type BundleLayout } from "./layouts.js";
import { withFullTileFallback } from "./partial-fallback.js";

const NOT_FOUND = 404;

const withTrailingSlash = (url: string): string => (url.endsWith("/") ? url : `${url}/`);

export const createHttpFetcher = ({
  baseUrl,
  fetch: fetchImpl = (input, init) => globalThis.fetch(input, init),
  layout = tlogTilesClientLayout,
}: {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly layout?: BundleLayout;
}): LogFetcher => {
  const base = withTrailingSlash(baseUrl);
  const get = async (path: string): Promise<Uint8Array | undefined> => {
    const url = new URL(path, base).toString();
    const response = await fetchImpl(url);
    if (response.status === NOT_FOUND) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`GET ${url} failed with status ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  return withFullTileFallback({
    readCheckpoint: () => get("checkpoint"),
    readTile: (address) => get(tilePath(address)),
    readEntryBundle: (address) => get(layout.entriesPath(address)),
  }, layout);
};
