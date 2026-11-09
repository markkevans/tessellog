import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppender, createMemoryDriver, type Appender } from "@tessellog/appender";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { generateNoteKey, parseSignerKey, parseVerifierKey, type Result } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { createLogHandler, startHttpLog, type HttpLog, type HttpLogOptions } from "../src/index.js";

const ORIGIN = "example.com/http-log";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const keys = () => unwrap(generateNoteKey({ name: ORIGIN }));

const withLog = async (
  test: (log: HttpLog, verifierKey: string) => Promise<void>,
  overrides?: Partial<HttpLogOptions>,
): Promise<void> => {
  const storageDir = await mkdtemp(join(tmpdir(), "tessellog-http-log-"));
  const { signerKey, verifierKey } = keys();
  const log = await startHttpLog({
    storageDir,
    signer: unwrap(parseSignerKey(signerKey)),
    port: 0,
    appender: { checkpointInterval: 50 },
    ...overrides,
  });
  try {
    await test(log, verifierKey);
  } finally {
    await log.close();
    await rm(storageDir, { recursive: true, force: true });
  }
};

const add = (log: HttpLog, body: string | Uint8Array): Promise<Response> =>
  fetch(new URL("add", log.url), { method: "POST", body });

const addedIndex = async (log: HttpLog, text: string): Promise<bigint> => {
  const response = await add(log, text);
  expect(response.status).toBe(200);
  return BigInt(await response.text());
};

describe("an HTTP log on the POSIX driver", () => {
  it("adds entries and proves each one with a client over HTTP", () =>
    withLog(async (log, verifierKey) => {
      const texts = ["alpha", "bravo", "charlie", "delta"];
      const indices = await Promise.all(texts.map((text) => addedIndex(log, text)));
      const client = createLogClient({
        fetcher: createHttpFetcher({ baseUrl: log.url }),
        origin: ORIGIN,
        logVerifier: unwrap(parseVerifierKey(verifierKey)),
      });
      const { checkpoint } = unwrap(await client.latestCheckpoint());
      expect(checkpoint.size).toBe(4n);
      const proofs = await Promise.all(
        texts.map((text, i) =>
          client.proveInclusion({ entry: new TextEncoder().encode(text), index: indices[i] ?? -1n, checkpoint }),
        ),
      );
      expect(proofs.every(({ ok }) => ok)).toBe(true);
    }));

  it("answers only once the entry is covered by a published checkpoint", () =>
    withLog(async (log, verifierKey) => {
      const index = await addedIndex(log, "alpha");
      const client = createLogClient({
        fetcher: createHttpFetcher({ baseUrl: log.url }),
        origin: ORIGIN,
        logVerifier: unwrap(parseVerifierKey(verifierKey)),
      });
      expect(unwrap(await client.latestCheckpoint()).checkpoint.size).toBeGreaterThan(index);
    }));

  it("serves the checkpoint as uncacheable text", () =>
    withLog(async (log) => {
      await addedIndex(log, "alpha");
      const response = await fetch(new URL("checkpoint", log.url));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(await response.text()).toMatch(new RegExp(`^${ORIGIN}\n1\n`));
    }));

  it("lets caches keep partial tiles for an hour and full tiles forever", () =>
    withLog(async (log) => {
      await Promise.all(Array.from({ length: 257 }, (_, i) => addedIndex(log, `entry ${i}`)));
      const partial = await fetch(new URL("tile/0/001.p/1", log.url));
      const full = await fetch(new URL("tile/0/000", log.url));
      const bundle = await fetch(new URL("tile/entries/000", log.url));
      expect(partial.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(full.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(bundle.headers.get("content-type")).toBe("application/octet-stream");
      expect((await full.arrayBuffer()).byteLength).toBe(256 * 32);
    }));

  it("refuses entries larger than the layout allows without reading them whole", () =>
    withLog(async (log) => {
      const response = await add(log, new Uint8Array(64 * 1024 + 1));
      expect(response.status).toBe(413);
    }));

  it("accepts an entry of exactly the largest allowed size", () =>
    withLog(async (log) => {
      const response = await add(log, new Uint8Array(64 * 1024));
      expect(response.status).toBe(200);
    }));

  it("accepts an empty entry", () =>
    withLog(async (log) => {
      expect(await addedIndex(log, "")).toBe(0n);
    }));

  it("asks clients to retry later when the log pushes back", () =>
    withLog(
      async (log) => {
        const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => add(log, `entry ${i}`)));
        const statuses = responses.map(({ status }) => status);
        expect(statuses).toContain(503);
        expect(statuses.filter((status) => status !== 503 && status !== 200)).toEqual([]);
        const refused = responses.find(({ status }) => status === 503);
        expect(refused?.headers.get("retry-after")).toBe("1");
      },
      { appender: { checkpointInterval: 50, pushback: { maxOutstanding: 1 } } },
    ));

  it.each([
    ["/", "GET"],
    ["/.state/lock", "GET"],
    ["/tile/0/../../.state/lock", "GET"],
    ["/tile/0/x1/000", "GET"],
    ["/tile/0/000.p/0", "GET"],
    ["/tile/0/000.p/256", "GET"],
    ["/tile/0/999", "GET"],
  ])("answers 404 for %s", (path) =>
    withLog(async (log) => {
      await addedIndex(log, "alpha");
      expect((await fetch(new URL(path, log.url))).status).toBe(404);
    }),
  );

  it.each([
    ["add", "GET"],
    ["checkpoint", "POST"],
  ])("refuses %s with method %s", (path, method) =>
    withLog(async (log) => {
      const response = await fetch(new URL(path, log.url), { method });
      expect(response.status).toBe(405);
    }),
  );
});

describe("the log handler", () => {
  const failingAppender = (error: Error): Appender => {
    const appender = createAppender({ driver: createMemoryDriver(), signer: unwrap(parseSignerKey(keys().signerKey)) });
    return {
      ...appender,
      add: async () => {
        throw error;
      },
    };
  };

  it("reports an unexpected failure as a server error without leaking it", async () => {
    const appender = failingAppender(new Error("disk on fire"));
    const handler = createLogHandler({ appender, read: async () => undefined });
    const response = await handler(new Request("http://log.example/add", { method: "POST", body: "a" }));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("internal error\n");
    await appender.shutdown();
  });
});
