import { leafHash, rootHash } from "../../src/index.js";

const RFC6962_LEAVES_HEX = [
  "",
  "00",
  "10",
  "2021",
  "3031",
  "40414243",
  "5051525354555657",
  "606162636465666768696a6b6c6d6e6f",
] as const;

export const rfc6962Leaves = (): readonly Uint8Array[] =>
  RFC6962_LEAVES_HEX.map((hex) => Uint8Array.from(Buffer.from(hex, "hex")));

export const rfc6962LeafHashes = (): readonly Uint8Array[] =>
  rfc6962Leaves().map(leafHash);

export const rfc6962SubtreeHash = (start: number, end: number): Uint8Array =>
  rootHash(rfc6962LeafHashes().slice(start, end));
