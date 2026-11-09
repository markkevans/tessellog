import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseCosignerKey, parseVerifierKey } from "@tessellog/core";
import { startWitnessServer } from "../src/index.js";

const USAGE = `usage: witness-server --storage-dir DIR --cosigner-key FILE --log VKEY [--log VKEY]...
                      [--port 2025] [--host 127.0.0.1]

Each --log is a log's verifier key; its name is the log's origin. Logs list
this witness in their policy by its cosignature verifier key (see keygen).`;
const USAGE_EXIT_CODE = 2;

const exitWith: (message: string, code?: number) => never = (message, code = 1) => {
  console.error(message);
  process.exit(code);
};

const { values } = parseArgs({
  options: {
    "storage-dir": { type: "string" },
    "cosigner-key": { type: "string" },
    log: { type: "string", multiple: true, default: [] },
    port: { type: "string", default: "2025" },
    host: { type: "string", default: "127.0.0.1" },
  },
});

const storageDir = values["storage-dir"];
const cosignerKeyFile = values["cosigner-key"];
if (storageDir === undefined || cosignerKeyFile === undefined || values.log.length === 0) {
  exitWith(USAGE, USAGE_EXIT_CODE);
}

const cosigner = parseCosignerKey((await readFile(cosignerKeyFile, "utf8")).trim());
if (!cosigner.ok) {
  exitWith(`invalid cosigner key in ${cosignerKeyFile}: ${cosigner.error}`);
}

const logs = values.log.map((vkey) => {
  const verifier = parseVerifierKey(vkey);
  if (!verifier.ok) {
    return exitWith(`invalid --log ${vkey}: ${verifier.error}`);
  }
  return { origin: verifier.value.name, verifiers: [verifier.value] };
});

const witness = await startWitnessServer({
  storageDir,
  cosigner: cosigner.value,
  logs,
  port: Number(values.port),
  host: values.host,
});
console.log(`${cosigner.value.name} is witnessing ${logs.map(({ origin }) => origin).join(", ")} at ${witness.url}`);

const stop = async (): Promise<void> => {
  await witness.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
