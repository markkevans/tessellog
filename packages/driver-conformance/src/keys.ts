import { parseSignerKey, parseVerifierKey, type NoteSigner, type NoteVerifier } from "@tessellog/core";

const TEST_SKEY =
  "PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz";
const TEST_VKEY = "PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW";

export const TEST_ORIGIN = "PeterNeumann";

export const testSigner = (): NoteSigner => {
  const parsed = parseSignerKey(TEST_SKEY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

export const testVerifier = (): NoteVerifier => {
  const parsed = parseVerifierKey(TEST_VKEY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};
