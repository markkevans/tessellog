import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { formatCheckpoint, parseCheckpoint, parseVerifierKey, type Checkpoint } from "@tessellog/core";
import { createMonitor } from "../src/index.js";

const USAGE = `usage: monitor --url URL --verifier-key VKEY [--origin ORIGIN]
               [--state FILE] [--interval-ms 5000] [--once]

Prints "index<TAB>sha256(entry)" for every new entry, after proving it.
Exits with status 1 if the log forks, shrinks or serves anything unverifiable.`;
const USAGE_EXIT_CODE = 2;
const ALARM_EXIT_CODE = 1;

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    "verifier-key": { type: "string" },
    origin: { type: "string" },
    state: { type: "string" },
    "interval-ms": { type: "string", default: "5000" },
    once: { type: "boolean", default: false },
  },
});

const url = values.url;
const verifierKey = values["verifier-key"];
if (url === undefined || verifierKey === undefined) {
  console.error(USAGE);
  process.exit(USAGE_EXIT_CODE);
}

const verifier = parseVerifierKey(verifierKey);
if (!verifier.ok) {
  console.error(`invalid verifier key: ${verifier.error}`);
  process.exit(USAGE_EXIT_CODE);
}

const readState = async (file: string | undefined): Promise<Checkpoint | undefined> => {
  const text = file === undefined ? undefined : await readFile(file, "utf8").catch(() => undefined);
  if (text === undefined) {
    return undefined;
  }
  const parsed = parseCheckpoint(text);
  if (!parsed.ok) {
    throw new Error(`cannot read monitor state from ${file}: ${parsed.error}`);
  }
  return parsed.value;
};

const trusted = await readState(values.state);
const monitor = createMonitor({
  client: createLogClient({
    fetcher: createHttpFetcher({ baseUrl: url }),
    origin: values.origin ?? verifier.value.name,
    logVerifier: verifier.value,
  }),
  ...(trusted === undefined ? {} : { trusted }),
  onEntry: async ({ index, entry }) => {
    console.log(`${index}\t${bytesToHex(sha256(entry))}`);
  },
});

const watch = async (): Promise<never> => {
  const polled = await monitor.poll();
  if (!polled.ok) {
    console.error(`ALARM: ${polled.error}`);
    process.exit(ALARM_EXIT_CODE);
  }
  if (values.state !== undefined) {
    await writeFile(values.state, formatCheckpoint(polled.value.checkpoint));
  }
  if (values.once) {
    process.exit(0);
  }
  await sleep(Number(values["interval-ms"]));
  return watch();
};

await watch();
