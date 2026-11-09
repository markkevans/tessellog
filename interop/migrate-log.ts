import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createAppender, createMigrationTarget } from "@tessellog/appender";
import { createLogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { parseSignerKey, parseVerifierKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const fail = (message: string): never => {
  console.error(`migrate-log: ${message}`);
  process.exit(1);
};

const { values, positionals } = parseArgs({
  options: {
    "source-dir": { type: "string" },
    "target-dir": { type: "string" },
    vkey: { type: "string" },
    origin: { type: "string" },
    "private-key": { type: "string" },
  },
  allowPositionals: true,
});

const sourceDir = values["source-dir"] ?? fail("--source-dir is required");
const targetDir = values["target-dir"] ?? fail("--target-dir is required");
const origin = values.origin ?? fail("--origin is required");
const verifier = parseVerifierKey(values.vkey ?? fail("--vkey is required"));
const signer = parseSignerKey(
  (await readFile(values["private-key"] ?? fail("--private-key is required"), "utf8")).trim(),
);

const source = createFileFetcher({ root: sourceDir });
const opened = await createLogClient({
  fetcher: source,
  origin,
  logVerifier: verifier.ok ? verifier.value : fail(verifier.error),
}).latestCheckpoint();
const { size, rootHash } = opened.ok ? opened.value.checkpoint : fail(opened.error);

const driver = await openPosixDriver({ root: targetDir });
const migrated = await createMigrationTarget({ driver }).migrate({
  readEntryBundle: (address) => source.readEntryBundle(address),
  sourceSize: size,
  sourceRoot: rootHash,
});
if (!migrated.ok) {
  await driver.close();
  fail(migrated.error);
}

const appender = createAppender({ driver, signer: signer.ok ? signer.value : fail(signer.error) });
await Promise.all(positionals.map(async (file) => appender.add(new Uint8Array(await readFile(file)))));
await appender.shutdown();
await driver.close();
console.log(`tessellog migrated ${size} entries from Tessera's log and appended ${positionals.length} more`);
