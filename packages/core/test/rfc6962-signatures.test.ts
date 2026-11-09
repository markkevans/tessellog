import { describe, expect, it } from "vitest";
import {
  createRFC6962Signer,
  formatCheckpoint,
  openNote,
  p256PublicKeyInfo,
  parseRFC6962VerifierKey,
  rfc6962VerifierKey,
  rootHash,
  signNote,
  type NoteVerifier,
} from "../src/index.js";

const ROME_CHECKPOINT =
  "rome.ct.filippo.io/2024h1\n115474666\n2q1K6aiIJR+F7TyhiWOghoWOjY0/3dVBLsBbAvB4xCw=\n\n— rome.ct.filippo.io/2024h1 ePSrrgAAAY5+gVlSBAMARzBFAiEAv8bOMzo3Ed/GbU9fzzJvaStX6i8xTsmEF+NqvpGhIO0CIEn1X+zzVEerdix64GEn97XCXObA2G5JQ8UDDqCKdG5m\n";
const ROME_VKEY =
  "rome.ct.filippo.io/2024h1+78f4abae+BTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABAFzPC3fap+uINc1RQ4eRbYMUt84+bKkA8GDLN8KwVdzAgYhYSv4kS8XSheGLAHCWhIJTJbuC3sL88bNMTtrsBM=";
const ROME_PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAXM8Ld9qn64g1zVFDh5FtgxS3zj5sqQDwYMs3wrBV3MCBiFhK/iRLxdKF4YsAcJaEglMlu4Lewvzxs0xO2uwEw==";
const ARGON_PUBLIC_KEY =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHblsqctplMVc5ramA7vSuNxUQxcomQwGAVAdnWTAWUYr3MgDHQW0LagJ95lB7QT75Ve6JgT2EVLOFGU7L3YrwA==";
const ARGON_VKEY =
  "ct.googleapis.com/logs/us1/argon2024+7deb49d0+BTBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABB25bKnLaZTFXOa2pgO70rjcVEMXKJkMBgFQHZ1kwFlGK9zIAx0FtC2oCfeZQe0E++VXuiYE9hFSzhRlOy92K8A=";
const RSA_PUBLIC_KEY_VKEY =
  "rsa.example/log+00000000+BTBcMA0GCSqGSIb3DQEBAQUAA0sAMEgCQQC7";

const base64 = (text: string): Uint8Array => Uint8Array.from(Buffer.from(text, "base64"));
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const verifier = (vkey: string): NoteVerifier => {
  const parsed = parseRFC6962VerifierKey(vkey);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

describe("verifying RFC 6962 tree-head note signatures", () => {
  it("verifies a checkpoint published by a real static-CT log", async () => {
    const opened = await openNote({ message: utf8(ROME_CHECKPOINT), verifiers: [verifier(ROME_VKEY)] });
    expect(opened.ok && opened.value.verifiedSignatures.map(({ keyId }) => keyId)).toEqual([0x78f4abae]);
  });

  it("rejects the checkpoint once its contents change", async () => {
    const tampered = ROME_CHECKPOINT.replace("115474666", "115474667");
    expect((await openNote({ message: utf8(tampered), verifiers: [verifier(ROME_VKEY)] })).ok).toBe(false);
  });

  it("rejects a signature too short to hold a timestamp and signature", async () => {
    expect(await verifier(ROME_VKEY).verify(utf8("x\n"), new Uint8Array(4))).toBe(false);
  });
});

describe("formatting RFC 6962 verifier keys", () => {
  it.each([
    ["https://ct.googleapis.com/logs/us1/argon2024/", ARGON_PUBLIC_KEY, ARGON_VKEY],
    ["https://rome.ct.filippo.io/2024h1/", ROME_PUBLIC_KEY, ROME_VKEY],
    ["ct.googleapis.com/logs/us1/argon2024/", ARGON_PUBLIC_KEY, ARGON_VKEY],
    ["ct.googleapis.com/logs/us1/argon2024", ARGON_PUBLIC_KEY, ARGON_VKEY],
  ])("formats %s exactly as Go's RFC6962VerifierString does", (logUrl, publicKey, vkey) => {
    expect(rfc6962VerifierKey({ logUrl, publicKey: base64(publicKey) })).toEqual({ ok: true, value: vkey });
  });

  it("refuses a log URL that is not a valid key name", () => {
    expect(
      rfc6962VerifierKey({ logUrl: "ct.googleapis.com/logs/us1/argon2024+cheese", publicKey: base64(ARGON_PUBLIC_KEY) }).ok,
    ).toBe(false);
  });
});

describe("parsing RFC 6962 verifier keys", () => {
  it("refuses keys other than ECDSA P-256", () => {
    expect(parseRFC6962VerifierKey(RSA_PUBLIC_KEY_VKEY)).toEqual({
      ok: false,
      error: "rsa.example/log: only ECDSA P-256 RFC 6962 keys are supported",
    });
  });

  it("refuses a key whose key ID does not match", () => {
    expect(parseRFC6962VerifierKey(ROME_VKEY.replace("78f4abae", "78f4abaf")).ok).toBe(false);
  });

  it("refuses a key of another signature type", () => {
    expect(parseRFC6962VerifierKey("PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW").ok).toBe(false);
  });
});

describe("signing RFC 6962 tree heads", () => {
  const privateKey = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const name = "log.example/2026";
  const signer = () => {
    const created = createRFC6962Signer({ name, privateKey, clock: () => 1_794_177_863_000 });
    if (!created.ok) {
      throw new Error(created.error);
    }
    return created.value;
  };
  const matchingVerifier = () => {
    const vkey = rfc6962VerifierKey({ logUrl: name, publicKey: p256PublicKeyInfo(privateKey) });
    if (!vkey.ok) {
      throw new Error(vkey.error);
    }
    return verifier(vkey.value);
  };
  const checkpointText = (origin: string, extensions: readonly string[] = []) =>
    formatCheckpoint({ origin, size: 5n, rootHash: rootHash([]), extensions });

  it("produces signatures its verifier key accepts", async () => {
    const signed = await signNote({ text: checkpointText(name), signers: [signer()] });
    const opened = signed.ok && (await openNote({ message: utf8(signed.value), verifiers: [matchingVerifier()] }));
    expect(opened && opened.ok).toBe(true);
  });

  it("does not verify a checkpoint whose origin differs from the key name", async () => {
    const signature = await signer().sign(utf8(checkpointText("other.example/log")));
    expect(await matchingVerifier().verify(utf8(checkpointText("other.example/log")), signature)).toBe(false);
  });

  it("does not verify a checkpoint with extension lines", async () => {
    const signature = await signer().sign(utf8(checkpointText(name)));
    expect(await matchingVerifier().verify(utf8(checkpointText(name, ["ext"])), signature)).toBe(false);
  });

  it("refuses a signer name that is not a valid key name", () => {
    expect(createRFC6962Signer({ name: "bad name", privateKey }).ok).toBe(false);
  });
});
