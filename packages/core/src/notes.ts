import { concatBytes } from "@noble/hashes/utils";
import { encodeBase64 } from "./base64.js";
import { isValidKeyName, type NoteSigner } from "./note-keys.js";
import { failure, success, type Result } from "./result.js";

const CONTROL_EXCEPT_NEWLINE = /[\x00-\x09\x0b-\x1f]/;
const LONE_SURROGATE = /\p{Surrogate}/u;

const isValidNoteText = (text: string): boolean =>
  text.endsWith("\n") &&
  !CONTROL_EXCEPT_NEWLINE.test(text) &&
  !LONE_SURROGATE.test(text);

const keyIdBytes = (keyId: number): Uint8Array =>
  Uint8Array.of(keyId >>> 24, (keyId >>> 16) & 0xff, (keyId >>> 8) & 0xff, keyId & 0xff);

const signatureLine = async (
  signer: NoteSigner,
  message: Uint8Array,
): Promise<string> => {
  const signature = await signer.sign(message);
  const encoded = encodeBase64(concatBytes(keyIdBytes(signer.keyId), signature));
  return `— ${signer.name} ${encoded}\n`;
};

export const signNote = async ({
  text,
  signers,
}: {
  readonly text: string;
  readonly signers: readonly NoteSigner[];
}): Promise<Result<string>> => {
  if (!isValidNoteText(text)) {
    return failure("malformed note");
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
