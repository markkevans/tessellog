import { parseArgs } from "node:util";
import { createAppender } from "@tessellog/appender";
import { createRFC6962Signer, p256PublicKeyInfo, rfc6962VerifierKey } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { encodeCtSubmission, staticCtEntriesPath, staticCtLayout } from "@tessellog/static-ct";
import { interopCtEntry } from "./ct-entries.js";

const fail = (message: string): never => {
  console.error(`write-static-ct: ${message}`);
  process.exit(1);
};

const { values } = parseArgs({
  options: {
    "storage-dir": { type: "string" },
    name: { type: "string" },
    "p256-key-hex": { type: "string" },
    count: { type: "string" },
  },
});

const root = values["storage-dir"] ?? fail("--storage-dir is required");
const name = values.name ?? fail("--name is required");
const privateKey = Uint8Array.from(Buffer.from(values["p256-key-hex"] ?? fail("--p256-key-hex is required"), "hex"));
const count = Number(values.count ?? fail("--count is required"));

const signer = createRFC6962Signer({ name, privateKey });
const driver = await openPosixDriver({ root, entriesPath: staticCtEntriesPath });
const appender = createAppender({
  driver,
  signer: signer.ok ? signer.value : fail(signer.error),
  layout: staticCtLayout,
  batching: { maxSize: 256, maxAge: 10 },
});
await Promise.all(Array.from({ length: count }, (_, i) => appender.add(encodeCtSubmission(interopCtEntry(i)))));
await appender.shutdown();
await driver.close();

const vkey = rfc6962VerifierKey({ logUrl: name, publicKey: p256PublicKeyInfo(privateKey) });
console.log(vkey.ok ? vkey.value : fail(vkey.error));
