import { describe, expect, it } from "vitest";
import {
  cosignatureVerifierKeyFrom,
  openNote,
  parseCosignerKey,
  parseCosignerVerifierKey,
  signNote,
  type NoteVerifier,
} from "../src/index.js";
import {
  COSIGNED_TEXT,
  GO_COSIGNATURE_LINE,
  GO_COSIGNED_NOTE,
  WITNESS_COSIGNATURE_VKEY,
} from "./fixtures/cosignatures.js";
import { PETER_VKEY, WITNESS_SKEY, WITNESS_VKEY } from "./fixtures/keys.js";

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const cosignerVerifier = (): NoteVerifier => {
  const parsed = parseCosignerVerifierKey(WITNESS_COSIGNATURE_VKEY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

const goTimestamp = (): number =>
  Number(
    new DataView(Uint8Array.from(Buffer.from(GO_COSIGNATURE_LINE.split(" ")[2] ?? "", "base64")).buffer).getBigUint64(4),
  );

describe("verifying Ed25519 checkpoint cosignatures (tlog-cosignature)", () => {
  it("opens a note cosigned by Go's formats/note", async () => {
    const opened = await openNote({ message: utf8(GO_COSIGNED_NOTE), verifiers: [cosignerVerifier()] });
    expect(opened.ok && opened.value.verifiedSignatures.map(({ name, keyId }) => ({ name, keyId }))).toEqual([
      { name: "WitnessOne", keyId: 0x3f2acfb9 },
    ]);
  });

  it("rejects a cosignature whose timestamp was altered", async () => {
    const encoded = GO_COSIGNATURE_LINE.split(" ")[2] ?? "";
    const raw = Uint8Array.from(Buffer.from(encoded, "base64"));
    const altered = Uint8Array.from(raw, (byte, i) => (i === 11 ? byte ^ 1 : byte));
    const line = `— WitnessOne ${Buffer.from(altered).toString("base64")}\n`;
    expect(
      await openNote({ message: utf8(`${COSIGNED_TEXT}\n${line}`), verifiers: [cosignerVerifier()] }),
    ).toEqual({ ok: false, error: "invalid signature for key WitnessOne+3f2acfb9" });
  });

  it("rejects a cosignature moved onto a different checkpoint", async () => {
    const otherText = COSIGNED_TEXT.replace("\n8\n", "\n9\n");
    expect(
      (await openNote({ message: utf8(`${otherText}\n${GO_COSIGNATURE_LINE}`), verifiers: [cosignerVerifier()] })).ok,
    ).toBe(false);
  });

  it("rejects a cosignature of the wrong length", async () => {
    expect(await cosignerVerifier().verify(utf8(COSIGNED_TEXT), new Uint8Array(64))).toBe(false);
  });
});

describe("parsing cosigner keys", () => {
  it("converts a standard Ed25519 verifier key exactly as Go does", () => {
    expect(cosignatureVerifierKeyFrom(WITNESS_VKEY)).toEqual({ ok: true, value: WITNESS_COSIGNATURE_VKEY });
  });

  it("refuses to convert a key that is not a valid Ed25519 verifier key", () => {
    expect(cosignatureVerifierKeyFrom("WitnessOne+00000000+AW/0vdadeZvB98cEdVaMBfkts+OT6iw8cVehe9i4nUTx").ok).toBe(false);
  });

  it("accepts only cosignature (0x04) verifier keys", () => {
    expect(parseCosignerVerifierKey(PETER_VKEY)).toEqual({
      ok: false,
      error: "PeterNeumann is not an Ed25519 cosignature (0x04) key",
    });
  });

  it("refuses a cosignature verifier key whose key ID does not match", () => {
    expect(parseCosignerVerifierKey(WITNESS_COSIGNATURE_VKEY.replace("3f2acfb9", "3f2acfba")).ok).toBe(false);
  });

  it("refuses a malformed cosigner signing key", () => {
    expect(parseCosignerKey("not a key", { clock: () => 0 }).ok).toBe(false);
  });
});

describe("signing Ed25519 checkpoint cosignatures", () => {
  it("reproduces Go's cosignature byte for byte at the same timestamp", async () => {
    const cosigner = parseCosignerKey(WITNESS_SKEY, { clock: goTimestamp });
    if (!cosigner.ok) {
      throw new Error(cosigner.error);
    }
    expect(cosigner.value.keyId).toBe(0x3f2acfb9);
    expect(await signNote({ text: COSIGNED_TEXT, signers: [cosigner.value] })).toEqual({
      ok: true,
      value: GO_COSIGNED_NOTE,
    });
  });
});

describe("timestamping cosignatures", () => {
  it("stamps cosignatures with the current time by default", async () => {
    const cosigner = parseCosignerKey(WITNESS_SKEY);
    if (!cosigner.ok) {
      throw new Error(cosigner.error);
    }
    const before = Math.floor(Date.now() / 1000);
    const signature = await cosigner.value.sign(utf8(COSIGNED_TEXT));
    const after = Math.floor(Date.now() / 1000);
    const stamped = Number(new DataView(signature.buffer, signature.byteOffset).getBigUint64(0));
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(stamped).toBeLessThanOrEqual(after);
  });
});
