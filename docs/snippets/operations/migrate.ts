import { createMigrationTarget } from "@tessellog/appender";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseVerifierKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";

const verifier = parseVerifierKey("example.com/my-log+afda4ace+AcOem5yfbPSq9fNpNGwfDJ+fU8XvGDaJweXRm65tp4RB");
if (!verifier.ok) throw new Error(verifier.error);

const source = createHttpFetcher({ baseUrl: "https://old-log.example.com/" });
const latest = await createLogClient({
  fetcher: source,
  origin: "example.com/my-log",
  logVerifier: verifier.value,
}).latestCheckpoint();
if (!latest.ok) throw new Error(latest.error);

const driver = await openPosixDriver({ root: "./migrated-log" });
const migrated = await createMigrationTarget({ driver }).migrate({
  readEntryBundle: (address) => source.readEntryBundle(address),
  sourceSize: latest.value.checkpoint.size,
  sourceRoot: latest.value.checkpoint.rootHash,
});
console.log(migrated.ok ? "copied and verified; start an appender on ./migrated-log" : migrated.error);
await driver.close();
