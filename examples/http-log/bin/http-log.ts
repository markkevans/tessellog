import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseSignerKey } from "@tessellog/core";
import { startHttpLog } from "../src/index.js";

const USAGE =
  "usage: http-log --storage-dir DIR --private-key FILE [--port 2024] [--host 127.0.0.1] [--checkpoint-interval-ms 1000]";
const USAGE_EXIT_CODE = 2;

const { values } = parseArgs({
  options: {
    "storage-dir": { type: "string" },
    "private-key": { type: "string" },
    port: { type: "string", default: "2024" },
    host: { type: "string", default: "127.0.0.1" },
    "checkpoint-interval-ms": { type: "string", default: "1000" },
  },
});

const storageDir = values["storage-dir"];
const privateKeyFile = values["private-key"];
if (storageDir === undefined || privateKeyFile === undefined) {
  console.error(USAGE);
  process.exit(USAGE_EXIT_CODE);
}

const signer = parseSignerKey((await readFile(privateKeyFile, "utf8")).trim());
if (!signer.ok) {
  console.error(`invalid private key in ${privateKeyFile}: ${signer.error}`);
  process.exit(1);
}

const log = await startHttpLog({
  storageDir,
  signer: signer.value,
  port: Number(values.port),
  host: values.host,
  appender: { checkpointInterval: Number(values["checkpoint-interval-ms"]) },
});
console.log(`serving ${signer.value.name} at ${log.url}`);

const stop = async (): Promise<void> => {
  await log.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
