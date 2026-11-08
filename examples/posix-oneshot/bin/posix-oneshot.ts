import { parseArgs } from "node:util";
import { oneshot } from "../src/index.js";

const USAGE = "usage: posix-oneshot --storage-dir DIR --private-key FILE FILE...";
const USAGE_EXIT_CODE = 2;

const { values, positionals } = parseArgs({
  options: {
    "storage-dir": { type: "string" },
    "private-key": { type: "string" },
  },
  allowPositionals: true,
});

const storageDir = values["storage-dir"];
const privateKeyFile = values["private-key"];

if (storageDir === undefined || privateKeyFile === undefined) {
  console.error(USAGE);
  process.exit(USAGE_EXIT_CODE);
}

const added = await oneshot({ storageDir, privateKeyFile, files: positionals });
added.forEach(({ file, index }) => {
  console.log(`${file}: ${index}`);
});
