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

export const logSigner = (): NoteSigner => {
  const parsed = parseSignerKey(LOG_SKEY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

export const logVerifier = (): NoteVerifier => {
  const parsed = parseVerifierKey(LOG_VKEY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};
