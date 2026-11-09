import { createAppender, createMemoryDriver, type Appender, type AppenderOptions } from "@tessellog/appender";
import { entriesPath, tileLayout, tilePath, TILE_WIDTH } from "@tessellog/core";
import { logSigner } from "./keys.js";

export const BASE_URL = "https://log.example/prefix/";

export type ServedLog = {
  readonly appender: Appender;
  readonly entries: readonly Uint8Array[];
  readonly files: ReadonlyMap<string, Uint8Array>;
};

export const entriesFor = (count: number, label = "entry"): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => new TextEncoder().encode(`${label} ${i}`));

const addressesForSize = (size: bigint) =>
  tileLayout(size).flatMap(({ level, fullTiles, partialWidth }) => [
    ...Array.from({ length: Number(fullTiles) }, (_, i) => ({
      level,
      index: BigInt(i),
      width: TILE_WIDTH,
    })),
    ...(partialWidth > 0 ? [{ level, index: fullTiles, width: partialWidth }] : []),
  ]);

const filesOf = async (appender: Appender, size: bigint) => {
  const tiles = addressesForSize(size);
  const bundles = tiles.filter(({ level }) => level === 0);
  const checkpoint = await appender.reader.readCheckpoint();
  const tileFiles = await Promise.all(
    tiles.map(async (address) => [tilePath(address), await appender.reader.readTile(address)] as const),
  );
  const bundleFiles = await Promise.all(
    bundles.map(
      async (address) => [entriesPath(address), await appender.reader.readEntryBundle(address)] as const,
    ),
  );
  return new Map(
    [["checkpoint", checkpoint] as const, ...tileFiles, ...bundleFiles].filter(
      (file): file is readonly [string, Uint8Array] => file[1] !== undefined,
    ),
  );
};

export const servedLog = async (
  entries: readonly Uint8Array[],
  options?: Partial<AppenderOptions>,
): Promise<ServedLog> => {
  const appender = createAppender({
    driver: createMemoryDriver(),
    signer: logSigner(),
    batching: { maxSize: 256, maxAge: 0 },
    ...options,
  });
  await Promise.all(entries.map((entry) => appender.add(entry)));
  await appender.shutdown();
  return { appender, entries, files: await filesOf(appender, BigInt(entries.length)) };
};

export type FakeServer = {
  readonly fetch: typeof fetch;
  readonly requested: () => readonly string[];
};

export const fakeServer = (
  files: ReadonlyMap<string, Uint8Array>,
  baseUrl: string = BASE_URL,
  status: (path: string) => number | undefined = () => undefined,
): FakeServer => {
  let requested: readonly string[] = [];
  return {
    fetch: async (input) => {
      const url = String(input);
      requested = [...requested, url];
      const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
      const forced = status(path);
      if (forced !== undefined) {
        return new Response(null, { status: forced });
      }
      const body = files.get(path);
      return body === undefined ? new Response(null, { status: 404 }) : new Response(new Uint8Array(body));
    },
    requested: () => requested,
  };
};
