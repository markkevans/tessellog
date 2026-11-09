import { writeFile } from "node:fs/promises";
import { cosignatureVerifierKeyFrom, generateNoteKey, type Result } from "@tessellog/core";

export type KeyFiles = {
  readonly signerKeyFile: string;
  readonly verifierKeyFile: string;
  readonly verifierKey: string;
  readonly cosignatureVerifierKey: string;
};

const PRIVATE = 0o600;
const PUBLIC = 0o644;

const valueOf = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

export const writeKeyFiles = async ({ name, out }: { readonly name: string; readonly out: string }): Promise<KeyFiles> => {
  const { signerKey, verifierKey } = valueOf(generateNoteKey({ name }));
  const signerKeyFile = `${out}.key`;
  const verifierKeyFile = `${out}.pub`;
  await writeFile(signerKeyFile, `${signerKey}\n`, { flag: "wx", mode: PRIVATE });
  await writeFile(verifierKeyFile, `${verifierKey}\n`, { flag: "wx", mode: PUBLIC });
  return {
    signerKeyFile,
    verifierKeyFile,
    verifierKey,
    cosignatureVerifierKey: valueOf(cosignatureVerifierKeyFrom(verifierKey)),
  };
};
