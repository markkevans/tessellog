import { concatBytes } from "@noble/hashes/utils";
import { encodeBase64 } from "./base64.js";
import {
  encodeKeyId,
  hasControlCharacters,
  MALFORMED_NOTE,
  SIGNATURE_PREFIX,
} from "./note-format.js";
import { isValidKeyName, type NoteSigner } from "./note-keys.js";
import { failure, success, type Result } from "./result.js";

const LONE_SURROGATE = /\p{Surrogate}/u;

const isValidNoteText = (text: string): boolean =>
  text.endsWith("\n") &&
  !hasControlCharacters(text) &&
  !LONE_SURROGATE.test(text);

const signatureLine = async (
  signer: NoteSigner,
  message: Uint8Array,
): Promise<string> => {
  const signature = await signer.sign(message);
  const encoded = encodeBase64(concatBytes(encodeKeyId(signer.keyId), signature));
  return `${SIGNATURE_PREFIX}${signer.name} ${encoded}\n`;
};

export const signNote = async ({
  text,
  signers,
}: {
  readonly text: string;
  readonly signers: readonly NoteSigner[];
}): Promise<Result<string>> => {
  if (!isValidNoteText(text)) {
    return failure(MALFORMED_NOTE);
  }
  if (signers.length === 0) {
    return failure("a note needs at least one signer");
  }
  const misnamed = signers.find((signer) => !isValidKeyName(signer.name));
  if (misnamed !== undefined) {
    return failure(`invalid signer name ${misnamed.name}`);
  }
  const message = new TextEncoder().encode(text);
  const lines = await Promise.all(
    signers.map((signer) => signatureLine(signer, message)),
  );
  return success(`${text}\n${lines.join("")}`);
};
