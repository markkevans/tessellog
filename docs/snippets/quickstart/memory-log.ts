import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { createLogClient } from "@tessellog/client";
import { generateNoteKey, parseSignerKey, parseVerifierKey } from "@tessellog/core";

const keys = generateNoteKey({ name: "example.com/my-log" });
if (!keys.ok) throw new Error(keys.error);
const signer = parseSignerKey(keys.value.signerKey);
const verifier = parseVerifierKey(keys.value.verifierKey);
if (!signer.ok || !verifier.ok) throw new Error("generated keys did not parse");

const appender = createAppender({
  driver: createMemoryDriver(),
  signer: signer.value,
  checkpointInterval: 100,
});

const entry = new TextEncoder().encode("hello, transparency");
const { index } = await appender.add(entry);
await appender.awaitPublication(index);

const client = createLogClient({
  fetcher: appender.reader,
  origin: "example.com/my-log",
  logVerifier: verifier.value,
});
const latest = await client.latestCheckpoint();
if (!latest.ok) throw new Error(latest.error);
const proved = await client.proveInclusion({ entry, index, checkpoint: latest.value.checkpoint });
console.log(proved.ok ? `entry ${index} is in the log` : proved.error);

await appender.shutdown();
