import { parseArgs } from "node:util";
import { createLogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { parseVerifierKey, toHex } from "@tessellog/core";
import { encodeCtSubmission, staticCtLayout } from "@tessellog/static-ct";
import { interopCtEntry } from "./ct-entries.js";

const fail = (message: string): never => {
  console.error(`verify-static-ct: ${message}`);
  process.exit(1);
};

const { values } = parseArgs({
  options: {
    "storage-dir": { type: "string" },
    vkey: { type: "string" },
    origin: { type: "string" },
    count: { type: "string" },
  },
});

const root = values["storage-dir"] ?? fail("--storage-dir is required");
const verifier = parseVerifierKey(values.vkey ?? fail("--vkey is required"));
const count = Number(values.count ?? fail("--count is required"));

const client = createLogClient({
  fetcher: createFileFetcher({ root, layout: staticCtLayout }),
  origin: values.origin ?? fail("--origin is required"),
  logVerifier: verifier.ok ? verifier.value : fail(verifier.error),
  layout: staticCtLayout,
});
const opened = await client.latestCheckpoint();
const checkpoint = opened.ok ? opened.value.checkpoint : fail(opened.error);
if (checkpoint.size !== BigInt(count)) {
  fail(`checkpoint size ${checkpoint.size}, want ${count}`);
}

let logged: readonly string[] = [];
for await (const item of client.entries({ checkpoint })) {
  logged = [...logged, item.ok ? toHex(item.value.entry) : fail(item.error)];
}
const expected = Array.from({ length: count }, (_, i) => toHex(encodeCtSubmission(interopCtEntry(i))));
const sortedLogged = [...logged].sort();
if ([...expected].sort().some((entry, i) => entry !== sortedLogged[i])) {
  fail("the log's entries differ from the expected CT entries");
}
console.log(`tessellog's client verified ${count} static-CT entries written by Tessera`);
