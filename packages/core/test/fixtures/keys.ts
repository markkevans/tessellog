import {
  parseSignerKey,
  parseVerifierKey,
  type NoteSigner,
  type NoteVerifier,
} from "../../src/index.js";

export const PETER_SKEY =
  "PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz";
export const PETER_VKEY =
  "PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW";
export const ENOCH_VKEY =
  "EnochRoot+af0cfe78+ATtqJ7zOtqQtYqOo0CpvDXNlMhV3HeJDpjrASKGLWdop";
export const WITNESS_SKEY =
  "PRIVATE+KEY+WitnessOne+73f152b1+AaA1V+rFd0kL2T2VE6eN8l3w436FpdT7Gv8oGE1lCS4H";
export const WITNESS_VKEY =
  "WitnessOne+73f152b1+AW/0vdadeZvB98cEdVaMBfkts+OT6iw8cVehe9i4nUTx";

export const signerFor = (skey: string): NoteSigner => {
  const parsed = parseSignerKey(skey);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

export const verifierFor = (vkey: string): NoteVerifier => {
  const parsed = parseVerifierKey(vkey);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};
