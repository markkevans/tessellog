import { createAppender, createMemoryDriver, type Appender, type AppenderOptions } from "@tessellog/appender";
import { generateNoteKey, parseSignerKey, type Result } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { createLogHandler, type LogHandler, type LogHandlerOptions } from "../src/index.js";

const ORIGIN = "example.com/log";
const BASE = "http://log.example/";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const appenderWith = (overrides?: Partial<AppenderOptions>): Appender =>
  createAppender({
    driver: createMemoryDriver(),
    signer: unwrap(parseSignerKey(unwrap(generateNoteKey({ name: ORIGIN })).signerKey)),
    checkpointInterval: 10,
    ...overrides,
  });

const withHandler = async (
  test: (handler: LogHandler) => Promise<void>,
  {
    appender = appenderWith(),
    ...options
  }: Partial<LogHandlerOptions> & { readonly appender?: Appender } = {},
): Promise<void> => {
  try {
    await test(createLogHandler({ appender, ...options }));
  } finally {
    await appender.shutdown();
  }
};

const post = (handler: LogHandler, body?: string | Uint8Array<ArrayBuffer>): Promise<Response> =>
  handler(new Request(new URL("add", BASE), { method: "POST", ...(body === undefined ? {} : { body }) }));

const get = (handler: LogHandler, path: string, method = "GET"): Promise<Response> =>
  handler(new Request(new URL(path, BASE), { method }));

const addedIndex = async (handler: LogHandler, text: string): Promise<bigint> => {
  const response = await post(handler, text);
  expect(response.status).toBe(200);
  return BigInt(await response.text());
};

describe("adding entries through the log handler", () => {
  it("answers with the index once a published checkpoint covers the entry", () =>
    withHandler(async (handler) => {
      expect(await addedIndex(handler, "alpha")).toBe(0n);
      expect(await (await get(handler, "checkpoint")).text()).toMatch(new RegExp(`^${ORIGIN}\n1\n`));
    }));

  it("treats a POST without a body as an empty entry", () =>
    withHandler(async (handler) => {
      expect(await (await post(handler)).text()).toBe("0\n");
    }));

  it("accepts an entry of exactly the layout's largest size", () =>
    withHandler(async (handler) => {
      expect((await post(handler, new Uint8Array(65_535))).status).toBe(200);
    }));

  it("refuses a larger entry without reading it whole", () =>
    withHandler(async (handler) => {
      const response = await post(handler, new Uint8Array(65_536));
      expect(response.status).toBe(413);
      expect(await response.text()).toBe("entries are limited to 65535 bytes\n");
    }));

  it("applies a smaller limit when given one", () =>
    withHandler(
      async (handler) => {
        expect((await post(handler, "12345")).status).toBe(200);
        expect((await post(handler, "123456")).status).toBe(413);
      },
      { maxEntryBytes: 5 },
    ));

  it("asks clients to retry later when the log pushes back", () =>
    withHandler(
      async (handler) => {
        const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => post(handler, `entry ${i}`)));
        const statuses = responses.map(({ status }) => status);
        expect(statuses).toContain(503);
        expect(statuses.filter((status) => status !== 503 && status !== 200)).toEqual([]);
        expect(responses.find(({ status }) => status === 503)?.headers.get("retry-after")).toBe("1");
      },
      { appender: appenderWith({ pushback: { maxOutstanding: 1 } }) },
    ));

  it("reports an unexpected failure as a server error without leaking it", async () => {
    const appender = appenderWith();
    const reported: unknown[] = [];
    await withHandler(
      async (handler) => {
        const response = await post(handler, "a");
        expect(response.status).toBe(500);
        expect(await response.text()).toBe("internal error\n");
        expect(reported).toEqual([new Error("disk on fire")]);
      },
      {
        appender: {
          ...appender,
          add: async () => {
            throw new Error("disk on fire");
          },
          shutdown: appender.shutdown,
        },
        onError: (error) => reported.push(error),
      },
    );
  });
});

describe("serving a log through the log handler", () => {
  it("serves the checkpoint as uncacheable text", () =>
    withHandler(async (handler) => {
      await addedIndex(handler, "alpha");
      const response = await get(handler, "checkpoint");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    }));

  it("lets caches keep partial tiles for an hour and full tiles forever", () =>
    withHandler(
      async (handler) => {
        await Promise.all(Array.from({ length: 257 }, (_, i) => addedIndex(handler, `entry ${i}`)));
        const partial = await get(handler, "tile/0/001.p/1");
        const full = await get(handler, "tile/0/000");
        const bundle = await get(handler, "tile/entries/000");
        expect(partial.headers.get("cache-control")).toBe("public, max-age=3600");
        expect(full.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(bundle.headers.get("content-type")).toBe("application/octet-stream");
        expect((await full.arrayBuffer()).byteLength).toBe(256 * 32);
      },
      { appender: appenderWith({ batching: { maxSize: 257 } }) },
    ));

  it("answers HEAD requests like GET", () =>
    withHandler(async (handler) => {
      await addedIndex(handler, "alpha");
      expect((await get(handler, "checkpoint", "HEAD")).status).toBe(200);
    }));

  it.each([
    "",
    ".state/lock",
    "tile/0/x1/000",
    "tile/0/000.p/0",
    "tile/0/000.p/256",
    "tile/0/999",
    "tile/0/x000/000",
    "tile/0/x999/x999/x999/x999/x999/x999/999",
    "tile/64/000",
    "tile/entries/001",
  ])("answers 404 for %j", (path) =>
    withHandler(async (handler) => {
      await addedIndex(handler, "alpha");
      expect((await get(handler, path)).status).toBe(404);
    }),
  );

  it.each([
    ["add", "GET", "POST"],
    ["checkpoint", "POST", "GET, HEAD"],
    ["tile/0/000.p/1", "DELETE", "GET, HEAD"],
  ])("refuses %s with method %s", (path, method, allowed) =>
    withHandler(async (handler) => {
      const response = await get(handler, path, method);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe(allowed);
    }),
  );
});
