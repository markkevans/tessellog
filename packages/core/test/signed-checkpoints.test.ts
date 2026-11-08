import { describe, expect, it } from "vitest";
import {
  formatCheckpoint,
  openCheckpoint,
  rootHash,
  signNote,
  type Checkpoint,
  type NoteSigner,
} from "../src/index.js";
import {
  PETER_SKEY,
  PETER_VKEY,
  signerFor,
  verifierFor,
  WITNESS_SKEY,
  WITNESS_VKEY,
} from "./fixtures/keys.js";

const ORIGIN = "example.com/log";

const checkpoint = (overrides?: Partial<Checkpoint>): Checkpoint => ({
  origin: ORIGIN,
  size: 0n,
  rootHash: rootHash([]),
  extensions: [],
  ...overrides,
});

const signText = async (
  text: string,
  signers: readonly NoteSigner[],
): Promise<Uint8Array> => {
  const signed = await signNote({ text, signers });
  if (!signed.ok) {
    throw new Error(signed.error);
  }
  return new TextEncoder().encode(signed.value);
};

const signedCheckpoint = (
  signers: readonly NoteSigner[] = [signerFor(PETER_SKEY)],
  overrides?: Partial<Checkpoint>,
): Promise<Uint8Array> => signText(formatCheckpoint(checkpoint(overrides)), signers);

describe("opening signed checkpoints", () => {
  it("returns the checkpoint when the log has signed it", async () => {
    const opened = await openCheckpoint({
      message: await signedCheckpoint(),
      origin: ORIGIN,
      logVerifier: verifierFor(PETER_VKEY),
    });
    expect(opened.ok && opened.value.checkpoint).toEqual(checkpoint());
  });

  it("reports cosignatures from other known keys", async () => {
    const opened = await openCheckpoint({
      message: await signedCheckpoint([signerFor(PETER_SKEY), signerFor(WITNESS_SKEY)]),
      origin: ORIGIN,
      logVerifier: verifierFor(PETER_VKEY),
      otherVerifiers: [verifierFor(WITNESS_VKEY)],
    });
    expect(
      opened.ok && opened.value.note.verifiedSignatures.map(({ name }) => name),
    ).toEqual(["PeterNeumann", "WitnessOne"]);
  });

  it("rejects a checkpoint from a different log origin", async () => {
    expect(
      await openCheckpoint({
        message: await signedCheckpoint(undefined, { origin: "elsewhere.org/log" }),
        origin: ORIGIN,
        logVerifier: verifierFor(PETER_VKEY),
      }),
    ).toEqual({
      ok: false,
      error: `checkpoint origin elsewhere.org/log does not match ${ORIGIN}`,
    });
  });

  it("rejects a checkpoint signed only by a key other than the log's", async () => {
    expect(
      await openCheckpoint({
        message: await signedCheckpoint([signerFor(WITNESS_SKEY)]),
        origin: ORIGIN,
        logVerifier: verifierFor(PETER_VKEY),
        otherVerifiers: [verifierFor(WITNESS_VKEY)],
      }),
    ).toEqual({
      ok: false,
      error: "checkpoint is not signed by log key PeterNeumann+c74f20a3",
    });
  });

  it("rejects a checkpoint whose contents changed after signing", async () => {
    const signed = new TextDecoder().decode(await signedCheckpoint());
    const tampered = new TextEncoder().encode(signed.replace(`${ORIGIN}\n0\n`, `${ORIGIN}\n1\n`));
    expect(
      await openCheckpoint({
        message: tampered,
        origin: ORIGIN,
        logVerifier: verifierFor(PETER_VKEY),
      }),
    ).toEqual({ ok: false, error: "invalid signature for key PeterNeumann+c74f20a3" });
  });

  it("rejects a signed note whose text is not a checkpoint", async () => {
    const opened = await openCheckpoint({
      message: await signText("not a checkpoint\n", [signerFor(PETER_SKEY)]),
      origin: ORIGIN,
      logVerifier: verifierFor(PETER_VKEY),
    });
    expect(opened.ok).toBe(false);
  });
});
