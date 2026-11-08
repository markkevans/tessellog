import { describe, expect, it } from "vitest";
import { parseSignerKey, parseVerifierKey } from "../src/index.js";

const PETER_VKEY =
  "PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW";
const PETER_SKEY =
  "PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz";

const message = (text: string): Uint8Array => new TextEncoder().encode(text);

const flipFirstByte = (bytes: Uint8Array): Uint8Array =>
  Uint8Array.from(bytes, (b, i) => (i === 0 ? (b + 1) & 0xff : b));

const strictSubstrings = (key: string): readonly string[] =>
  Array.from({ length: key.length + 1 }, (_, start) =>
    Array.from({ length: key.length - start }, (_, n) =>
      key.slice(start, start + n + 1),
    ),
  )
    .flat()
    .filter((candidate) => candidate !== key);

const singleCharacterIncrements = (key: string): readonly string[] =>
  Array.from(
    key,
    (char, i) =>
      key.slice(0, i) + String.fromCharCode(char.charCodeAt(0) + 1) + key.slice(i + 1),
  );

const verifierFor = (vkey: string) => {
  const parsed = parseVerifierKey(vkey);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

const signerFor = (skey: string) => {
  const parsed = parseSignerKey(skey);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

describe("parsing note verifier keys (signed-note)", () => {
  it("reads the name and key ID from a Go-generated verifier key", () => {
    const verifier = verifierFor(PETER_VKEY);
    expect(verifier.name).toBe("PeterNeumann");
    expect(verifier.keyId).toBe(0xc74f20a3);
  });

  it("rejects every truncation of a valid key", () => {
    const accepted = strictSubstrings(PETER_VKEY).filter(
      (candidate) => parseVerifierKey(candidate).ok,
    );
    expect(accepted).toEqual([]);
  });

  it("rejects every single-character corruption of a valid key", () => {
    const accepted = singleCharacterIncrements(PETER_VKEY).filter(
      (candidate) => parseVerifierKey(candidate).ok,
    );
    expect(accepted).toEqual([]);
  });

  it("rejects a key of the wrong length even when its key ID matches", () => {
    expect(
      parseVerifierKey(
        "PeterNeumann+cc469956+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TWBADKEY==",
      ).ok,
    ).toBe(false);
  });

  it("rejects an unknown signature algorithm even when its key ID matches", () => {
    expect(
      parseVerifierKey(
        "PeterNeumann+173116ae+ZRpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW",
      ).ok,
    ).toBe(false);
  });
});

describe("parsing note signer keys (signed-note)", () => {
  it("reads the name and key ID from a Go-generated signer key", () => {
    const signer = signerFor(PETER_SKEY);
    expect(signer.name).toBe("PeterNeumann");
    expect(signer.keyId).toBe(0xc74f20a3);
  });

  it("rejects every truncation of a valid key", () => {
    const accepted = strictSubstrings(PETER_SKEY).filter(
      (candidate) => parseSignerKey(candidate).ok,
    );
    expect(accepted).toEqual([]);
  });

  it("rejects every single-character corruption of a valid key", () => {
    const accepted = singleCharacterIncrements(PETER_SKEY).filter(
      (candidate) => parseSignerKey(candidate).ok,
    );
    expect(accepted).toEqual([]);
  });
});

describe("signing and verifying with a key pair", () => {
  it("verifies a signature made by the matching signer", async () => {
    const signature = await signerFor(PETER_SKEY).sign(message("hi"));
    expect(await verifierFor(PETER_VKEY).verify(message("hi"), signature)).toBe(true);
  });

  it("rejects a corrupted signature", async () => {
    const signature = await signerFor(PETER_SKEY).sign(message("hi"));
    expect(
      await verifierFor(PETER_VKEY).verify(message("hi"), flipFirstByte(signature)),
    ).toBe(false);
  });

  it("rejects a signature over a different message", async () => {
    const signature = await signerFor(PETER_SKEY).sign(message("hi"));
    expect(await verifierFor(PETER_VKEY).verify(message("ii"), signature)).toBe(false);
  });

  it("rejects a signature of the wrong length", async () => {
    expect(
      await verifierFor(PETER_VKEY).verify(message("hi"), new Uint8Array(3)),
    ).toBe(false);
  });
});
