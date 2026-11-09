import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tilePath } from "@tessellog/core";
import type { LogFetcher } from "./fetcher.js";
import { tlogTilesClientLayout, type BundleLayout } from "./layouts.js";
import { withFullTileFallback } from "./partial-fallback.js";

const isNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";

export const createFileFetcher = ({
  root,
  layout = tlogTilesClientLayout,
}: {
  readonly root: string;
  readonly layout?: BundleLayout;
}): LogFetcher => {
  const read = async (relativePath: string): Promise<Uint8Array | undefined> => {
    try {
      return new Uint8Array(await readFile(join(root, relativePath)));
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  };
  return withFullTileFallback({
    readCheckpoint: () => read("checkpoint"),
    readTile: (address) => read(tilePath(address)),
    readEntryBundle: (address) => read(layout.entriesPath(address)),
  }, layout);
};
