import { describe, expect, it } from "vitest";
import { parseSignerKey, signNote, type NoteSigner } from "../src/index.js";

const PETER_SKEY =
  "PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz";
const PETER_SIGNATURE_LINE =
  "— PeterNeumann x08go/ZJkuBS9UG/SffcvIAQxVBtiFupLLr8pAcElZInNIuGUgYN1FFYC2pZSNXgKvqfqdngotpRZb6KE6RyyBwJnAM=\n";
const NEUMANN_TEXT =
  "If you think cryptography is the answer to your problem,\n" +
  "then you don't know what your problem is.\n";

const peterSigner = (): NoteSigner => {
  const parsed = parseSignerKey(PETER_SKEY);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.value;
};

describe("signing notes (signed-note)", () => {
  it("matches the Go reference encoding byte for byte", async () => {
    expect(
      await signNote({ text: NEUMANN_TEXT, signers: [peterSigner()] }),
    ).toEqual({
      ok: true,
      value: `${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}`,
    });
  });

  it("rejects text that does not end with a newline", async () => {
    expect(
      await signNote({ text: "abc", signers: [peterSigner()] }),
    ).toEqual({ ok: false, error: "malformed note" });
  });

  it("rejects text containing control characters other than newline", async () => {
    expect(
      await signNote({ text: "tab\there\n", signers: [peterSigner()] }),
    ).toEqual({ ok: false, error: "malformed note" });
  });

  it("rejects text that is not valid UTF-8", async () => {
    expect(
      await signNote({ text: "lone \uD800 surrogate\n", signers: [peterSigner()] }),
    ).toEqual({ ok: false, error: "malformed note" });
  });

  it("requires at least one signer", async () => {
    expect(await signNote({ text: NEUMANN_TEXT, signers: [] })).toEqual({
      ok: false,
      error: "a note needs at least one signer",
    });
  });

  it("refuses signers whose names are not valid key names", async () => {
    const misnamed: NoteSigner = { ...peterSigner(), name: "Peter Neumann" };
    expect(
      await signNote({ text: NEUMANN_TEXT, signers: [misnamed] }),
    ).toEqual({ ok: false, error: "invalid signer name Peter Neumann" });
  });
});
