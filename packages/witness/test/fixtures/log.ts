import {
  consistencyProof,
  encodeBase64,
  formatCheckpoint,
  leafHash,
  parseCosignerKey,
  parseCosignerVerifierKey,
  parseSignerKey,
  parseVerifierKey,
  rootHash,
  signNote,
  type NoteSigner,
  type NoteVerifier,
} from "@tessellog/core";

export const ORIGIN = "PeterNeumann";
export const WITNESS_TIME = 1_794_177_863;

const required = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

export const logSigner = (): NoteSigner =>
  required(parseSignerKey("PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz"));

export const logVerifier = (): NoteVerifier =>
  required(parseVerifierKey("PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW"));

export const otherSigner = (): NoteSigner =>
  required(parseSignerKey("PRIVATE+KEY+PeterNeumann+6155a6c9+AQYZTh7G1MZ6UP6QBesD+BDQfIWoCeSXvOtaZgjHWXIp"));

export const witnessCosigner = (): NoteSigner =>
  required(
    parseCosignerKey("PRIVATE+KEY+WitnessOne+73f152b1+AaA1V+rFd0kL2T2VE6eN8l3w436FpdT7Gv8oGE1lCS4H", {
      clock: () => WITNESS_TIME,
    }),
  );

export const witnessVerifier = (): NoteVerifier =>
  required(parseCosignerVerifierKey("WitnessOne+3f2acfb9+BG/0vdadeZvB98cEdVaMBfkts+OT6iw8cVehe9i4nUTx"));

const leafHashes = (count: number, label = "leaf"): readonly Uint8Array[] =>
  Array.from({ length: count }, (_, i) => leafHash(new TextEncoder().encode(`${label} ${i}`)));

export type LogState = { readonly size: number; readonly label?: string; readonly signer?: NoteSigner };

export const signedCheckpoint = async ({ size, label, signer = logSigner() }: LogState): Promise<string> =>
  required(
    await signNote({
      text: formatCheckpoint({
        origin: ORIGIN,
        size: BigInt(size),
        rootHash: rootHash(leafHashes(size, label)),
        extensions: [],
      }),
      signers: [signer],
    }),
  );

export const proofLines = (oldSize: number, newSize: number, label?: string): readonly string[] =>
  oldSize === 0
    ? []
    : consistencyProof({ leafHashes: leafHashes(newSize, label), oldSize: BigInt(oldSize) }).map(encodeBase64);

export const addCheckpointBody = async (
  oldSize: number,
  state: LogState,
  proof: readonly string[] = proofLines(oldSize, state.size, state.label),
): Promise<string> => `old ${oldSize}\n${proof.map((line) => `${line}\n`).join("")}\n${await signedCheckpoint(state)}`;
