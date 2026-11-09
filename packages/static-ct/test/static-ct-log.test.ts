import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppender, createMemoryDriver, EntryTooLargeError, type LogDriver } from "@tessellog/appender";
import {
  createRFC6962Signer,
  openNote,
  p256PublicKeyInfo,
  parseRFC6962VerifierKey,
  rfc6962VerifierKey,
  rootHash,
} from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { describe, expect, it } from "vitest";
import {
  decodeTileLeaves,
  encodeCtSubmission,
  merkleTreeLeafHash,
  staticCtEntriesPath,
  staticCtLayout,
  type CtEntry,
} from "../src/index.js";
import { CERTIFICATE_ENTRY, PRECERTIFICATE_ENTRY } from "./fixtures.js";

const LOG_NAME = "ct.example/2026h2";
const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 7);

const ctSigner = () => {
  const signer = createRFC6962Signer({ name: LOG_NAME, privateKey: PRIVATE_KEY });
  if (!signer.ok) {
    throw new Error(signer.error);
  }
  return signer.value;
};

const ctAppender = (driver: LogDriver = createMemoryDriver({ entriesPath: staticCtEntriesPath })) =>
  createAppender({
    driver,
    signer: ctSigner(),
    layout: staticCtLayout,
    batching: { maxSize: 256, maxAge: 0 },
    antispam: { inMemoryEntries: 100 },
  });

const certificateOf = (text: string): CtEntry => ({ ...CERTIFICATE_ENTRY, certificate: new TextEncoder().encode(text) });

describe("running a static-CT log", () => {
  it("writes data tiles of TileLeaves carrying each entry's index", async () => {
    const driver = createMemoryDriver({ entriesPath: staticCtEntriesPath });
    const appender = ctAppender(driver);
    const entries = [CERTIFICATE_ENTRY, PRECERTIFICATE_ENTRY, certificateOf("third")];
    await Promise.all(entries.map((entry) => appender.add(encodeCtSubmission(entry))));
    await appender.shutdown();
    const bundle = await driver.readEntryBundle({ index: 0n, width: 3 });
    expect(bundle && decodeTileLeaves(bundle)).toEqual({
      ok: true,
      value: entries.map((entry, i) => ({ entry, index: BigInt(i) })),
    });
  });

  it("builds the tree from RFC 6962 MerkleTreeLeaf hashes", async () => {
    const driver = createMemoryDriver({ entriesPath: staticCtEntriesPath });
    const appender = ctAppender(driver);
    const entries = [CERTIFICATE_ENTRY, PRECERTIFICATE_ENTRY];
    await Promise.all(entries.map((entry) => appender.add(encodeCtSubmission(entry))));
    await appender.shutdown();
    expect((await driver.readTreeState()).rootHash).toEqual(
      rootHash(entries.map((entry, i) => merkleTreeLeafHash(entry, BigInt(i)))),
    );
  });

  it("publishes a checkpoint with an RFC 6962 tree-head signature", async () => {
    const driver = createMemoryDriver({ entriesPath: staticCtEntriesPath });
    const appender = ctAppender(driver);
    await appender.add(encodeCtSubmission(CERTIFICATE_ENTRY));
    await appender.shutdown();
    const vkey = rfc6962VerifierKey({ logUrl: LOG_NAME, publicKey: p256PublicKeyInfo(PRIVATE_KEY) });
    const verifier = vkey.ok ? parseRFC6962VerifierKey(vkey.value) : vkey;
    const message = await driver.readCheckpoint();
    const opened = verifier.ok && message && (await openNote({ message, verifiers: [verifier.value] }));
    expect(opened && opened.ok).toBe(true);
  });

  it("accepts certificates beyond the tlog-tiles limit, up to 256 KiB", async () => {
    const appender = ctAppender();
    const large = { ...CERTIFICATE_ENTRY, certificate: new Uint8Array(100_000) };
    expect((await appender.add(encodeCtSubmission(large))).index).toBe(0n);
  });

  it("rejects submissions beyond 256 KiB", async () => {
    const appender = ctAppender();
    const huge = { ...CERTIFICATE_ENTRY, certificate: new Uint8Array(256 * 1024) };
    await expect(appender.add(encodeCtSubmission(huge))).rejects.toBeInstanceOf(EntryTooLargeError);
  });

  it("rejects submissions that are not a TileLeaf", async () => {
    await expect(ctAppender().add(Uint8Array.of(1, 2, 3))).rejects.toThrow(/invalid static-CT submission/);
  });

  it("treats a resubmitted certificate as a duplicate even with a new timestamp", async () => {
    const appender = ctAppender();
    const first = await appender.add(encodeCtSubmission(CERTIFICATE_ENTRY));
    const again = await appender.add(encodeCtSubmission({ ...CERTIFICATE_ENTRY, timestamp: 1n }));
    expect(again).toEqual({ index: first.index, isDup: true });
  });
});

describe("storing a static-CT log on disk", () => {
  it("writes entry bundles under tile/data", async () => {
    const root = await mkdtemp(join(tmpdir(), "tessellog-static-ct-"));
    const driver = await openPosixDriver({ root, entriesPath: staticCtEntriesPath });
    const appender = ctAppender(driver);
    await appender.add(encodeCtSubmission(CERTIFICATE_ENTRY));
    await appender.shutdown();
    await driver.close();
    const bundle = new Uint8Array(await readFile(join(root, "tile/data/000.p/1")));
    expect(decodeTileLeaves(bundle).ok).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});

describe("decoding static-CT bundles for the appender", () => {
  it("rejects a bundle whose TileLeaves carry the wrong indices", () => {
    const bundle = encodeCtSubmission(CERTIFICATE_ENTRY);
    expect(staticCtLayout.decodeBundle(bundle, 256n)).toEqual({
      ok: false,
      error: "TileLeaf 0 carries leaf index 0, want 256",
    });
  });
});
