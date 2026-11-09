import type { CtEntry } from "../src/index.js";

const fill = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

export const CERTIFICATE_ENTRY: CtEntry = {
  timestamp: 1_794_177_863_123n,
  isPrecert: false,
  certificate: utf8("certificate der bytes"),
  fingerprintsChain: [fill(0xaa), fill(0xbb)],
};

export const PRECERTIFICATE_ENTRY: CtEntry = {
  timestamp: 1_794_177_863_456n,
  isPrecert: true,
  certificate: utf8("tbs certificate bytes"),
  precertificate: utf8("precertificate der bytes"),
  issuerKeyHash: fill(0xcc),
  fingerprintsChain: [fill(0xdd)],
};
