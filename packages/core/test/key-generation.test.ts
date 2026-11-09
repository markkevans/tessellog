import { describe, expect, it } from "vitest";
import { decodeBase64, generateNoteKey, openNote, signNote } from "../src/index.js";
import { PETER_SKEY, PETER_VKEY, signerFor, verifierFor } from "./fixtures/keys.js";

const seedOf = (skey: string): Uint8Array => {
  const material = decodeBase64(skey.split("+").slice(4).join("+"));
  if (material === undefined) {
    throw new Error("fixture key is not base64");
  }
  return material.slice(1);
};

const generated = (options: Parameters<typeof generateNoteKey>[0]) => {
  const keys = generateNoteKey(options);
  if (!keys.ok) {
    throw new Error(keys.error);
  }
  return keys.value;
};

describe("generating note keys", () => {
  it("formats a seed exactly as Go's note.GenerateKey does", () => {
    expect(generated({ name: "PeterNeumann", seed: seedOf(PETER_SKEY) })).toEqual({
      signerKey: PETER_SKEY,
      verifierKey: PETER_VKEY,
    });
  });

  it("generates a fresh key pair that signs and verifies notes", async () => {
    const { signerKey, verifierKey } = generated({ name: "example.com/log" });
    const note = await signNote({ text: "hello\n", signers: [signerFor(signerKey)] });
    if (!note.ok) {
      throw new Error(note.error);
    }
    const opened = await openNote({
      message: new TextEncoder().encode(note.value),
      verifiers: [verifierFor(verifierKey)],
    });
    expect(opened.ok).toBe(true);
  });

  it("generates a different key each time", () => {
    expect(generated({ name: "example.com/log" }).signerKey).not.toBe(
      generated({ name: "example.com/log" }).signerKey,
    );
  });

  it.each(["", "has+plus", "has space"])("rejects the invalid key name %j", (name) => {
    expect(generateNoteKey({ name })).toEqual({ ok: false, error: `invalid key name ${JSON.stringify(name)}` });
  });

  it("rejects a seed that is not 32 bytes", () => {
    expect(generateNoteKey({ name: "PeterNeumann", seed: new Uint8Array(31) })).toEqual({
      ok: false,
      error: "seed must be 32 bytes",
    });
  });
});
