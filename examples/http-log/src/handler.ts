import { concatBytes } from "@noble/hashes/utils";
import { PushbackError, tlogTilesLayout, type Appender, type LogReader } from "@tessellog/appender";
import { entriesPath, TILE_WIDTH, tilePath } from "@tessellog/core";

export type LogHandler = (request: Request) => Promise<Response>;

export type LogHandlerOptions = {
  readonly appender: Appender;
  readonly maxEntryBytes?: number;
  readonly onError?: (error: unknown) => void;
};

const TILE = /^tile\/([0-9]|[1-5][0-9]|6[0-3]|entries)\/((?:x\d{3}\/)*\d{3})(?:\.p\/([1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))?$/;
const MAX_UINT64 = 2n ** 64n - 1n;
const IMMUTABLE = "public, max-age=31536000, immutable";
const ONE_HOUR = "public, max-age=3600";

type Resource = {
  readonly read: (reader: LogReader) => Promise<Uint8Array | undefined>;
  readonly cacheControl: string;
  readonly contentType: string;
};

const text = (status: number, body: string, headers: Record<string, string> = {}): Response =>
  new Response(`${body}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });

const CHECKPOINT: Resource = {
  read: (reader) => reader.readCheckpoint(),
  cacheControl: "no-cache",
  contentType: "text/plain; charset=utf-8",
};

const tileResource = (path: string): Resource | undefined => {
  const match = TILE.exec(path);
  if (match === null) {
    return undefined;
  }
  const [, level = "", digits = "", partialWidth] = match;
  const index = BigInt(digits.replaceAll("x", "").replaceAll("/", ""));
  if (index > MAX_UINT64) {
    return undefined;
  }
  const address = { index, width: partialWidth === undefined ? TILE_WIDTH : Number(partialWidth) };
  const isBundle = level === "entries";
  const canonical = isBundle ? entriesPath(address) : tilePath({ level: Number(level), ...address });
  if (canonical !== path) {
    return undefined;
  }
  return {
    read: (reader) =>
      isBundle ? reader.readEntryBundle(address) : reader.readTile({ level: Number(level), ...address }),
    cacheControl: partialWidth === undefined ? IMMUTABLE : ONE_HOUR,
    contentType: "application/octet-stream",
  };
};

const resourceAt = (path: string): Resource | undefined => (path === "checkpoint" ? CHECKPOINT : tileResource(path));

const readCapped = async (body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | undefined> => {
  const reader = (body ?? new Blob([]).stream()).getReader();
  const next = async (chunks: readonly Uint8Array[], total: number): Promise<Uint8Array | undefined> => {
    const { done, value } = await reader.read();
    if (done) {
      return concatBytes(...chunks);
    }
    if (total + value.length > limit) {
      await reader.cancel();
      return undefined;
    }
    return next([...chunks, value], total + value.length);
  };
  return next([], 0);
};

export const createLogHandler = ({
  appender,
  maxEntryBytes = tlogTilesLayout.maxEntryBytes,
  onError = console.error,
}: LogHandlerOptions): LogHandler => {
  const add = async (request: Request): Promise<Response> => {
    const entry = await readCapped(request.body, maxEntryBytes);
    if (entry === undefined) {
      return text(413, `entries are limited to ${maxEntryBytes} bytes`);
    }
    const { index } = await appender.add(entry);
    await appender.awaitPublication(index);
    return text(200, index.toString());
  };

  const serve = async (request: Request, resource: Resource): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return text(405, "method not allowed", { allow: "GET, HEAD" });
    }
    const body = await resource.read(appender.reader);
    return body === undefined
      ? text(404, "not found")
      : new Response(Uint8Array.from(body), {
          headers: { "content-type": resource.contentType, "cache-control": resource.cacheControl },
        });
  };

  const route = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname.slice(1);
    if (path === "add") {
      return request.method === "POST" ? add(request) : text(405, "method not allowed", { allow: "POST" });
    }
    const resource = resourceAt(path);
    return resource === undefined ? text(404, "not found") : serve(request, resource);
  };

  return async (request) => {
    try {
      return await route(request);
    } catch (error) {
      if (error instanceof PushbackError) {
        return text(503, "the log is busy, try again", { "retry-after": "1" });
      }
      onError(error);
      return text(500, "internal error");
    }
  };
};
