import { parseArgs } from "node:util";
import { writeKeyFiles } from "../src/index.js";

const USAGE = `usage: keygen --name NAME --out PREFIX

Writes PREFIX.key (the private signer key, mode 0600) and PREFIX.pub (the
verifier key). For a log, NAME is its origin, such as example.com/log.`;
const USAGE_EXIT_CODE = 2;

const { values } = parseArgs({ options: { name: { type: "string" }, out: { type: "string" } } });

if (values.name === undefined || values.out === undefined) {
  console.error(USAGE);
  process.exit(USAGE_EXIT_CODE);
}

const keys = await writeKeyFiles({ name: values.name, out: values.out });
console.log(`private key:   ${keys.signerKeyFile} (keep it secret)
verifier key:  ${keys.verifierKey}
as a witness:  ${keys.cosignatureVerifierKey}
               (use this key in a policy's "witness" line)`);
