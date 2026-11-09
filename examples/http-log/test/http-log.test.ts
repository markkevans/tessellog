import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { generateNoteKey, parseSignerKey, parseVerifierKey, type Result } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { startHttpLog, type HttpLog, type HttpLogOptions } from "../src/index.js";

const ORIGIN = "example.com/http-log";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const withLog = async (
  test: (log: HttpLog, verifierKey: string) => Promise<void>,
  overrides?: Partial<HttpLogOptions>,
): Promise<void> => {
  const storageDir = await mkdtemp(join(tmpdir(), "tessellog-http-log-"));
  const { signerKey, verifierKey } = unwrap(generateNoteKey({ name: ORIGIN }));
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

const add = (log: HttpLog, body: string | Uint8Array<ArrayBuffer>): Promise<Response> =>
  fetch(new URL("add", log.url), { method: "POST", body });

const clientFor = (log: HttpLog, verifierKey: string) =>
  createLogClient({
    fetcher: createHttpFetcher({ baseUrl: log.url }),
    origin: ORIGIN,
    logVerifier: unwrap(parseVerifierKey(verifierKey)),
  });

describe("an HTTP log on the POSIX driver", () => {
  it("adds entries and proves each one with a client over HTTP", () =>
    withLog(async (log, verifierKey) => {
      const texts = ["alpha", "bravo", "charlie", "delta"];
      const indices = await Promise.all(texts.map(async (text) => BigInt(await (await add(log, text)).text())));
      const client = clientFor(log, verifierKey);
      const { checkpoint } = unwrap(await client.latestCheckpoint());
      expect(checkpoint.size).toBe(4n);
      const proofs = await Promise.all(
        texts.map((text, i) =>
          client.proveInclusion({ entry: new TextEncoder().encode(text), index: indices[i] ?? -1n, checkpoint }),
        ),
      );
      expect(proofs.every(({ ok }) => ok)).toBe(true);
    }));

  it("keeps the log on disk across restarts", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "tessellog-http-log-"));
    const { signerKey, verifierKey } = unwrap(generateNoteKey({ name: ORIGIN }));
    const options = {
      storageDir,
      signer: unwrap(parseSignerKey(signerKey)),
      port: 0,
      appender: { checkpointInterval: 50 },
    };
    const first = await startHttpLog(options);
    await add(first, "alpha");
    await first.close();
    const second = await startHttpLog(options);
    expect(await (await add(second, "bravo")).text()).toBe("1\n");
    expect(unwrap(await clientFor(second, verifierKey).latestCheckpoint()).checkpoint.size).toBe(2n);
    await second.close();
    await rm(storageDir, { recursive: true, force: true });
  });
});
