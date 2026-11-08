import { decodeBase64 } from "./base64.js";
import {
  hasControlCharacters,
  MALFORMED_NOTE,
  SIGNATURE_PREFIX,
  splitKeyIdPrefix,
} from "./note-format.js";
import { isValidKeyName, type NoteVerifier } from "./note-keys.js";
import { failure, success, type Result } from "./result.js";

const SIGNATURE_BLOCK_SEPARATOR = "\n\n";
const MAX_SIGNATURES = 100;

export type NoteSignature = {
  readonly name: string;
  readonly keyId: number;
  readonly base64: string;
};

export type OpenedNote = {
  readonly text: string;
  readonly verifiedSignatures: readonly NoteSignature[];
  readonly unverifiedSignatures: readonly NoteSignature[];
};

type ParsedSignature = NoteSignature & { readonly signature: Uint8Array };

type ParsedNote = {
  readonly text: string;
  readonly signatures: readonly ParsedSignature[];
};

type Tally = {
  readonly verified: readonly ParsedSignature[];
  readonly unverified: readonly ParsedSignature[];
};

const decodeUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return undefined;
  }
};

const parseSignatureLine = (line: string): ParsedSignature | undefined => {
  if (!line.startsWith(SIGNATURE_PREFIX)) {
    return undefined;
  }
  const body = line.slice(SIGNATURE_PREFIX.length);
  const space = body.indexOf(" ");
  const name = body.slice(0, space);
  const base64 = body.slice(space + 1);
  const raw = decodeBase64(base64);
  const prefixed = raw === undefined ? undefined : splitKeyIdPrefix(raw);
  if (space < 0 || prefixed === undefined || !isValidKeyName(name)) {
    return undefined;
  }
  return { name, base64, ...prefixed };
};

const parseNote = (message: Uint8Array): Result<ParsedNote> => {
  const decoded = decodeUtf8(message);
  if (decoded === undefined || hasControlCharacters(decoded)) {
    return failure(MALFORMED_NOTE);
  }
  const split = decoded.lastIndexOf(SIGNATURE_BLOCK_SEPARATOR);
  const block = decoded.slice(split + SIGNATURE_BLOCK_SEPARATOR.length);
  if (split < 0 || block === "" || !block.endsWith("\n")) {
    return failure(MALFORMED_NOTE);
  }
  const lines = block.slice(0, -1).split("\n");
  const signatures = lines.map(parseSignatureLine);
  if (lines.length > MAX_SIGNATURES || signatures.includes(undefined)) {
    return failure(MALFORMED_NOTE);
  }
  return success({
    text: decoded.slice(0, split + 1),
    signatures: signatures.filter((s): s is ParsedSignature => s !== undefined),
  });
};

const keyLabel = ({ name, keyId }: KeyReference): string =>
  `${name}+${keyId.toString(16).padStart(8, "0")}`;

type KeyReference = Pick<NoteSignature, "name" | "keyId">;

const sameKey = (a: KeyReference, b: KeyReference): boolean =>
  a.name === b.name && a.keyId === b.keyId;

const sameLine = (a: NoteSignature, b: NoteSignature): boolean =>
  a.name === b.name && a.base64 === b.base64;

const recordUnverified = (tally: Tally, signature: ParsedSignature): Tally =>
  tally.unverified.some((seen) => sameLine(seen, signature))
    ? tally
    : { ...tally, unverified: [...tally.unverified, signature] };

const addSignature = async (
  tally: Tally,
  signature: ParsedSignature,
  verifiers: readonly NoteVerifier[],
  text: Uint8Array,
): Promise<Result<Tally>> => {
  const candidates = verifiers.filter((verifier) => sameKey(verifier, signature));
  const [verifier] = candidates;
  if (verifier === undefined) {
    return success(recordUnverified(tally, signature));
  }
  if (candidates.length > 1) {
    return failure(`ambiguous key ${keyLabel(signature)}`);
  }
  if (tally.verified.some((seen) => sameKey(seen, signature))) {
    return success(tally);
  }
  return (await verifier.verify(text, signature.signature))
    ? success({ ...tally, verified: [...tally.verified, signature] })
    : failure(`invalid signature for key ${keyLabel(signature)}`);
};

const tallySignatures = (
  { text, signatures }: ParsedNote,
  verifiers: readonly NoteVerifier[],
): Promise<Result<Tally>> => {
  const textBytes = new TextEncoder().encode(text);
  return signatures.reduce<Promise<Result<Tally>>>(
    async (pending, signature) => {
      const tally = await pending;
      return tally.ok ? addSignature(tally.value, signature, verifiers, textBytes) : tally;
    },
    Promise.resolve(success({ verified: [], unverified: [] })),
  );
};

const publicSignature = ({ name, keyId, base64 }: ParsedSignature): NoteSignature => ({
  name,
  keyId,
  base64,
});

export const openNote = async ({
  message,
  verifiers,
}: {
  readonly message: Uint8Array;
  readonly verifiers: readonly NoteVerifier[];
}): Promise<Result<OpenedNote>> => {
  const parsed = parseNote(message);
  if (!parsed.ok) {
    return parsed;
  }
  const tally = await tallySignatures(parsed.value, verifiers);
  if (!tally.ok) {
    return tally;
  }
  if (tally.value.verified.length === 0) {
    return failure("note has no verifiable signatures");
  }
  return success({
    text: parsed.value.text,
    verifiedSignatures: tally.value.verified.map(publicSignature),
    unverifiedSignatures: tally.value.unverified.map(publicSignature),
  });
};
