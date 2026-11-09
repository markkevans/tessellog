import { cosignatureVerifierKeyFrom, generateNoteKey } from "@tessellog/core";

const keys = generateNoteKey({ name: "example.com/my-log" });
if (!keys.ok) throw new Error(keys.error);

console.log(keys.value.signerKey);
console.log(keys.value.verifierKey);

const asWitness = cosignatureVerifierKeyFrom(keys.value.verifierKey);
if (asWitness.ok) console.log(asWitness.value);
