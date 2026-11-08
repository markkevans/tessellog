import { describe, expect, it } from "vitest";
import { openNote, signNote, type NoteSigner } from "../src/index.js";
import {
  ENOCH_VKEY,
  PETER_SKEY,
  PETER_VKEY,
  signerFor,
  verifierFor,
} from "./fixtures/keys.js";

const ENOCH_SIGNATURE_LINE =
  "— EnochRoot rwz+eBzmZa0SO3NbfRGzPCpDckykFXSdeX+MNtCOXm2/5n2tiOHp+vAF1aGrQ5ovTG01oOTGwnWLox33WWd1RvMc+QQ=\n";
const PETER_SIGNATURE_LINE =
  "— PeterNeumann x08go/ZJkuBS9UG/SffcvIAQxVBtiFupLLr8pAcElZInNIuGUgYN1FFYC2pZSNXgKvqfqdngotpRZb6KE6RyyBwJnAM=\n";
const NEUMANN_TEXT =
  "If you think cryptography is the answer to your problem,\n" +
  "then you don't know what your problem is.\n";

const peterSigner = (): NoteSigner => signerFor(PETER_SKEY);

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

const corrupt = (line: string): string =>
  `${line.slice(0, 60)}ABCD${line.slice(60)}`;

const PETER = {
  name: "PeterNeumann",
  keyId: 0xc74f20a3,
  base64:
    "x08go/ZJkuBS9UG/SffcvIAQxVBtiFupLLr8pAcElZInNIuGUgYN1FFYC2pZSNXgKvqfqdngotpRZb6KE6RyyBwJnAM=",
};
const ENOCH = {
  name: "EnochRoot",
  keyId: 0xaf0cfe78,
  base64:
    "rwz+eBzmZa0SO3NbfRGzPCpDckykFXSdeX+MNtCOXm2/5n2tiOHp+vAF1aGrQ5ovTG01oOTGwnWLox33WWd1RvMc+QQ=",
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

describe("opening notes (signed-note)", () => {
  const twoSignatures = (): Uint8Array =>
    utf8(`${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}${ENOCH_SIGNATURE_LINE}`);

  it("separates signatures from known keys from unknown ones", async () => {
    expect(
      await openNote({
        message: twoSignatures(),
        verifiers: [verifierFor(PETER_VKEY)],
      }),
    ).toEqual({
      ok: true,
      value: {
        text: NEUMANN_TEXT,
        verifiedSignatures: [PETER],
        unverifiedSignatures: [ENOCH],
      },
    });
  });

  it("verifies every signature whose key is known", async () => {
    const opened = await openNote({
      message: twoSignatures(),
      verifiers: [verifierFor(PETER_VKEY), verifierFor(ENOCH_VKEY)],
    });
    expect(opened).toEqual({
      ok: true,
      value: {
        text: NEUMANN_TEXT,
        verifiedSignatures: [PETER, ENOCH],
        unverifiedSignatures: [],
      },
    });
  });

  it("fails when no signature comes from a known key", async () => {
    expect(await openNote({ message: twoSignatures(), verifiers: [] })).toEqual({
      ok: false,
      error: "note has no verifiable signatures",
    });
  });

  it("fails when two known verifiers share the signing key's name and ID", async () => {
    expect(
      await openNote({
        message: utf8(`${NEUMANN_TEXT}\n${ENOCH_SIGNATURE_LINE}`),
        verifiers: [
          verifierFor(ENOCH_VKEY),
          verifierFor(PETER_VKEY),
          verifierFor(ENOCH_VKEY),
        ],
      }),
    ).toEqual({ ok: false, error: "ambiguous key EnochRoot+af0cfe78" });
  });

  it("ignores duplicate verifiers for keys that did not sign", async () => {
    const opened = await openNote({
      message: utf8(`${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}`),
      verifiers: [
        verifierFor(ENOCH_VKEY),
        verifierFor(PETER_VKEY),
        verifierFor(ENOCH_VKEY),
      ],
    });
    expect(opened.ok).toBe(true);
  });

  it("rejects a bad signature from a known key", async () => {
    expect(
      await openNote({
        message: utf8(`${NEUMANN_TEXT}\n${corrupt(PETER_SIGNATURE_LINE)}`),
        verifiers: [verifierFor(PETER_VKEY)],
      }),
    ).toEqual({
      ok: false,
      error: "invalid signature for key PeterNeumann+c74f20a3",
    });
  });

  it("rejects the note even when a valid signature follows a bad one", async () => {
    expect(
      await openNote({
        message: utf8(
          `${NEUMANN_TEXT}\n${corrupt(PETER_SIGNATURE_LINE)}${ENOCH_SIGNATURE_LINE}`,
        ),
        verifiers: [verifierFor(PETER_VKEY), verifierFor(ENOCH_VKEY)],
      }),
    ).toEqual({
      ok: false,
      error: "invalid signature for key PeterNeumann+c74f20a3",
    });
  });

  it("drops repeated signatures", async () => {
    const message = utf8(
      `${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}${PETER_SIGNATURE_LINE}` +
        `${ENOCH_SIGNATURE_LINE}${ENOCH_SIGNATURE_LINE}${corrupt(ENOCH_SIGNATURE_LINE)}`,
    );
    expect(
      await openNote({ message, verifiers: [verifierFor(PETER_VKEY)] }),
    ).toEqual({
      ok: true,
      value: {
        text: NEUMANN_TEXT,
        verifiedSignatures: [PETER],
        unverifiedSignatures: [
          ENOCH,
          {
            ...ENOCH,
            base64: `${ENOCH.base64.slice(0, 48)}ABCD${ENOCH.base64.slice(48)}`,
          },
        ],
      },
    });
  });

  it("refuses notes carrying more than 100 signatures", async () => {
    const message = utf8(`${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE.repeat(101)}`);
    expect(
      await openNote({ message, verifiers: [verifierFor(PETER_VKEY)] }),
    ).toEqual({ ok: false, error: "malformed note" });
    expect(await openNote({ message, verifiers: [] })).toEqual({
      ok: false,
      error: "malformed note",
    });
  });

  it.each([
    ["text with no signature block", utf8(NEUMANN_TEXT)],
    ["an empty signature block", utf8(`${NEUMANN_TEXT}\n`)],
    [
      "a signature line missing its newline",
      utf8(`${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE.slice(0, -1)}`),
    ],
    [
      "a control character",
      utf8(`\x01${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}`),
    ],
    [
      "invalid UTF-8",
      Uint8Array.of(0xff, ...utf8(`${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}`)),
    ],
    [
      "a key name containing a space",
      utf8(`${NEUMANN_TEXT}\n— Bad Name ${PETER.base64}\n`),
    ],
    [
      "a key name containing a plus sign",
      utf8(`${NEUMANN_TEXT}\n— Peter+Neumann ${PETER.base64}\n`),
    ],
    [
      "a signature line with no space before the signature",
      utf8(`${NEUMANN_TEXT}\n— PeterNeumann\n`),
    ],
    [
      "a signature that is not base64",
      utf8(`${NEUMANN_TEXT}\n— PeterNeumann not*base64\n`),
    ],
    [
      "a signature too short to hold a key ID and signature",
      utf8(`${NEUMANN_TEXT}\n— PeterNeumann AAAAAA==\n`),
    ],
    [
      "a line that is not a signature",
      utf8(`${NEUMANN_TEXT}\n${PETER_SIGNATURE_LINE}Unexpected line.\n`),
    ],
  ])("rejects %s as malformed", async (_, message) => {
    expect(
      await openNote({ message, verifiers: [verifierFor(PETER_VKEY)] }),
    ).toEqual({ ok: false, error: "malformed note" });
  });
});
