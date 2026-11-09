import { decodeBase64, HASH_BYTES, type Result } from "@tessellog/core";

const OLD_SIZE_LINE = /^old (0|[1-9][0-9]*)$/;
const MAX_PROOF_LINES = 63;
const SEPARATOR = "\n\n";

export type AddCheckpointRequest = {
  readonly oldSize: bigint;
  readonly proof: readonly Uint8Array[];
  readonly checkpoint: Uint8Array;
  readonly origin: string;
};

const decodeUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
};

const decodeHash = (line: string): Uint8Array | undefined => {
  const hash = decodeBase64(line);
  return hash?.length === HASH_BYTES ? hash : undefined;
};

export const parseAddCheckpoint = (body: Uint8Array): Result<AddCheckpointRequest> => {
  const text = decodeUtf8(body);
  const split = text?.indexOf(SEPARATOR) ?? -1;
  if (text === undefined || split < 0) {
    return { ok: false, error: "request must hold an old size, a proof and a checkpoint" };
  }
  const [oldLine = "", ...proofText] = text.slice(0, split).split("\n");
  const oldSize = OLD_SIZE_LINE.exec(oldLine)?.[1];
  const proof = proofText.map(decodeHash);
  if (oldSize === undefined || proof.length > MAX_PROOF_LINES || proof.includes(undefined)) {
    return { ok: false, error: "malformed old size or consistency proof" };
  }
  const checkpointText = text.slice(split + SEPARATOR.length);
  return {
    ok: true,
    value: {
      oldSize: BigInt(oldSize),
      proof: proof.filter((hash): hash is Uint8Array => hash !== undefined),
      checkpoint: new TextEncoder().encode(checkpointText),
      origin: checkpointText.slice(0, checkpointText.indexOf("\n")),
    },
  };
};
