import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppender, createMemoryDriver, createMigrationTarget, type LogDriver } from "@tessellog/appender";
import { createHttpFetcher, createLogClient, type LogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import {
  createRFC6962Signer,
  p256PublicKeyInfo,
  parseRFC6962VerifierKey,
  rfc6962VerifierKey,
  type Checkpoint,
} from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { describe, expect, it } from "vitest";
import { encodeCtSubmission, staticCtEntriesPath, staticCtLayout, type CtEntry } from "../src/index.js";
import { CERTIFICATE_ENTRY } from "./fixtures.js";

const LOG_NAME = "ct.example/2026h2";
const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 7);

const required = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const certificates = (count: number): readonly CtEntry[] =>
  Array.from({ length: count }, (_, i) => ({
    ...CERTIFICATE_ENTRY,
    certificate: new TextEncoder().encode(`certificate ${i}`),
  }));

const writeLog = async (driver: LogDriver, entries: readonly CtEntry[]): Promise<void> => {
  const appender = createAppender({
    driver,
    signer: required(createRFC6962Signer({ name: LOG_NAME, privateKey: PRIVATE_KEY })),
    layout: staticCtLayout,
    batching: { maxSize: 256, maxAge: 0 },
  });
  await Promise.all(entries.map((entry) => appender.add(encodeCtSubmission(entry))));
  await appender.shutdown();
};

const verifier = () =>
  required(parseRFC6962VerifierKey(required(rfc6962VerifierKey({ logUrl: LOG_NAME, publicKey: p256PublicKeyInfo(PRIVATE_KEY) }))));

const latest = async (client: LogClient): Promise<Checkpoint> => required(await client.latestCheckpoint()).checkpoint;

const withTempDir = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "tessellog-ct-client-"));
  try {
    await test(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

describe("verifying a static-CT log with the client", () => {
  it("proves every entry of a static-CT log read from disk", () =>
    withTempDir(async (root) => {
      const entries = certificates(300);
      const driver = await openPosixDriver({ root, entriesPath: staticCtEntriesPath });
      await writeLog(driver, entries);
      await driver.close();
      const client = createLogClient({
        fetcher: createFileFetcher({ root, layout: staticCtLayout }),
        origin: LOG_NAME,
        logVerifier: verifier(),
        layout: staticCtLayout,
      });
      const checkpoint = await latest(client);
      const proven = await Promise.all(
        entries.map((entry, i) => client.proveInclusion({ entry: encodeCtSubmission(entry), index: BigInt(i), checkpoint })),
      );
      expect(proven.every((result) => result.ok)).toBe(true);
    }), 30_000);

  it("streams static-CT entries back as submissions", () =>
    withTempDir(async (root) => {
      const entries = certificates(3);
      const driver = await openPosixDriver({ root, entriesPath: staticCtEntriesPath });
      await writeLog(driver, entries);
      await driver.close();
      const client = createLogClient({
        fetcher: createFileFetcher({ root, layout: staticCtLayout }),
        origin: LOG_NAME,
        logVerifier: verifier(),
        layout: staticCtLayout,
      });
      let streamed: readonly Uint8Array[] = [];
      for await (const item of client.entries({ checkpoint: await latest(client) })) {
        streamed = [...streamed, required(item).entry];
      }
      expect(streamed).toEqual(entries.map(encodeCtSubmission));
    }));

  it("falls back to the full data tile over HTTP when a partial is gone", async () => {
    const entries = certificates(300);
    const driver = createMemoryDriver({ entriesPath: staticCtEntriesPath });
    await writeLog(driver, entries);
    await driver.collectGarbage(300n);
    const fetcher = createHttpFetcher({
      baseUrl: "https://ct.example/",
      layout: staticCtLayout,
      fetch: async (input) => {
        const path = String(input).slice("https://ct.example/".length);
        const match = /^tile\/data\/(\d{3})$/.exec(path);
        const bundle = match ? await driver.readEntryBundle({ index: BigInt(match[1] ?? "0"), width: 256 }) : undefined;
        return bundle === undefined ? new Response(null, { status: 404 }) : new Response(new Uint8Array(bundle));
      },
    });
    const partial = await fetcher.readEntryBundle({ index: 0n, width: 2 });
    expect(partial && staticCtLayout.decodeBundle(partial, 0n)).toEqual({
      ok: true,
      value: entries.slice(0, 2).map(encodeCtSubmission),
    });
  });
});

describe("migrating a static-CT log", () => {
  it("reproduces the source root using the static-CT layout", async () => {
    const source = createMemoryDriver({ entriesPath: staticCtEntriesPath });
    await writeLog(source, certificates(300));
    const target = createMemoryDriver({ entriesPath: staticCtEntriesPath });
    const { size, rootHash } = await source.readTreeState();
    const result = await createMigrationTarget({ driver: target, layout: staticCtLayout }).migrate({
      readEntryBundle: (address) => source.readEntryBundle(address),
      sourceSize: size,
      sourceRoot: rootHash,
    });
    expect(result).toEqual({ ok: true, value: undefined });
  });
});
