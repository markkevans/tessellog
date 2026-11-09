import type { CtEntry } from "@tessellog/static-ct";

const BASE_TIMESTAMP = 1_794_177_863_000n;

const filled = (byte: number): Uint8Array => new Uint8Array(32).fill(byte);
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

export const interopCtEntry = (i: number): CtEntry => {
  const common = {
    timestamp: BASE_TIMESTAMP + BigInt(i),
    fingerprintsChain: [filled(0xaa), filled(i % 256)],
  };
  return i % 3 === 0
    ? {
        ...common,
        isPrecert: true,
        certificate: utf8(`tbs certificate ${i}`),
        precertificate: utf8(`precertificate ${i}`),
        issuerKeyHash: filled(i % 256),
      }
    : { ...common, isPrecert: false, certificate: utf8(`certificate ${i}`) };
};
