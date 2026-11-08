import {
  parseSignerKey,
  parseVerifierKey,
  type NoteSigner,
  type NoteVerifier,
} from "@tessellog/core";

export const LOG_SKEY =
  "PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz";
export const LOG_VKEY =
  "PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW";
export const LOG_KEY_NAME = "PeterNeumann";
export const SECOND_LOG_SKEY =
  "PRIVATE+KEY+PeterNeumann+6155a6c9+AQYZTh7G1MZ6UP6QBesD+BDQfIWoCeSXvOtaZgjHWXIp";
export const SECOND_LOG_VKEY =
  "PeterNeumann+6155a6c9+AdVUUgD7WjSuwxeRDSZS0RNZi2pWj/unjyIhR5pJDXzG";
export const WITNESS_SKEY =
  "PRIVATE+KEY+WitnessOne+73f152b1+AaA1V+rFd0kL2T2VE6eN8l3w436FpdT7Gv8oGE1lCS4H";

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

export const logSigner = (): NoteSigner => signerFor(LOG_SKEY);

export const logVerifier = (): NoteVerifier => verifierFor(LOG_VKEY);
