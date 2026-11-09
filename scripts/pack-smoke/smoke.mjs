import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppender } from "@tessellog/appender";
import { createLogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { generateNoteKey, parseSignerKey, parseVerifierKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const entryPoints = {
  "@tessellog/core": "leafHash",
  "@tessellog/appender": "createAppender",
  "@tessellog/client": "createLogClient",
  "@tessellog/client/node": "createFileFetcher",
  "@tessellog/witness": "createWitness",
  "@tessellog/http": "createLogHandler",
  "@tessellog/http/node": "serveNode",
  "@tessellog/static-ct": "encodeTileLeaf",
  "@tessellog/driver-object-store": "createObjectStoreDriver",
  "@tessellog/driver-posix": "openPosixDriver",
  "@tessellog/driver-aws": "openAwsDriver",
  "@tessellog/driver-cloudflare": "openCloudflareDriver",
};

for (const [specifier, name] of Object.entries(entryPoints)) {
  const module = await import(specifier);
  assert.equal(typeof module[name], "function", `${specifier} exports ${name}`);
}

const unwrap = (result) => {
  assert.ok(result.ok, result.error);
  return result.value;
};

const keys = unwrap(generateNoteKey({ name: "example.com/smoke" }));
const directory = await mkdtemp(join(tmpdir(), "tessellog-smoke-"));
try {
  const driver = await openPosixDriver({ root: directory });
  const appender = createAppender({ driver, signer: unwrap(parseSignerKey(keys.signerKey)), batching: { maxSize: 1 } });
  const { index } = await appender.add(new TextEncoder().encode("hello from a packed tarball"));
  const published = appender.awaitPublication(index);
  await appender.shutdown();
  await published;
  await driver.close();

  const client = createLogClient({
    fetcher: createFileFetcher({ root: directory }),
    origin: "example.com/smoke",
    logVerifier: unwrap(parseVerifierKey(keys.verifierKey)),
  });
  const opened = unwrap(await client.latestCheckpoint());
  assert.equal(opened.checkpoint.size, 1n);
} finally {
  await rm(directory, { recursive: true, force: true });
}
