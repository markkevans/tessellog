import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createLogClient, type LogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { openCheckpoint, parseVerifierKey, type Checkpoint, type NoteVerifier } from "@tessellog/core";

const fail = (message: string): never => {
  console.error(`verify-log: ${message}`);
  process.exit(1);
};

const { values, positionals } = parseArgs({
  options: {
    "storage-dir": { type: "string" },
    vkey: { type: "string" },
    origin: { type: "string" },
    "previous-checkpoint": { type: "string" },
  },
  allowPositionals: true,
});

const storageDir = values["storage-dir"] ?? fail("--storage-dir is required");
const origin = values.origin ?? fail("--origin is required");
const previousFile = values["previous-checkpoint"] ?? fail("--previous-checkpoint is required");
const parsedKey = parseVerifierKey(values.vkey ?? fail("--vkey is required"));
const verifier: NoteVerifier = parsedKey.ok ? parsedKey.value : fail(parsedKey.error);

const client: LogClient = createLogClient({
  fetcher: createFileFetcher({ root: storageDir }),
  origin,
  logVerifier: verifier,
});

const latestOpened = await client.latestCheckpoint();
const latest: Checkpoint = latestOpened.ok ? latestOpened.value.checkpoint : fail(latestOpened.error);

const previousOpened = await openCheckpoint({
  message: new Uint8Array(await readFile(previousFile)),
  origin,
  logVerifier: verifier,
});
const previous: Checkpoint = previousOpened.ok
  ? previousOpened.value.checkpoint
  : fail(previousOpened.error);

const consistent = await client.checkConsistency(previous, latest);
if (!consistent.ok) {
  fail(`consistency ${previous.size} -> ${latest.size}: ${consistent.error}`);
}

let logged: readonly string[] = [];
for await (const item of client.entries({ checkpoint: latest })) {
  logged = [...logged, item.ok ? new TextDecoder().decode(item.value.entry) : fail(item.error)];
}
if (BigInt(logged.length) !== latest.size) {
  fail(`read ${logged.length} entries from a log of size ${latest.size}`);
}

const expected = [...(await Promise.all(positionals.map((file) => readFile(file, "utf8"))))].sort();
const actual = [...logged].sort();
if (expected.length !== actual.length || expected.some((entry, i) => entry !== actual[i])) {
  fail(`log holds ${actual.length} entries that differ from the ${expected.length} input files`);
}

console.log(
  `tessellog's client verified ${logged.length} entries and consistency with the previous checkpoint`,
);
