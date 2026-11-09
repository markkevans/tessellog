import { ed25519 } from "@noble/curves/ed25519";
import { concatBytes } from "@noble/hashes/utils";
import { encodeBase64 } from "./base64.js";
import { keyLabel } from "./note-format.js";
import { computeKeyId, isValidKeyName } from "./note-keys.js";
import { failure, success, type Result } from "./result.js";

const ALGORITHM_ED25519 = 0x01;
const SEED_BYTES = 32;

export type NoteKeyPair = {
  readonly signerKey: string;
  readonly verifierKey: string;
};

export const generateNoteKey = ({
  name,
  seed = ed25519.utils.randomPrivateKey(),
}: {
  readonly name: string;
  readonly seed?: Uint8Array;
}): Result<NoteKeyPair> => {
  if (!isValidKeyName(name)) {
    return failure(`invalid key name ${JSON.stringify(name)}`);
  }
  if (seed.length !== SEED_BYTES) {
    return failure("seed must be 32 bytes");
  }
  const publicKey = concatBytes(Uint8Array.of(ALGORITHM_ED25519), ed25519.getPublicKey(seed));
  const label = keyLabel({ name, keyId: computeKeyId(name, publicKey) });
  return success({
    signerKey: `PRIVATE+KEY+${label}+${encodeBase64(concatBytes(Uint8Array.of(ALGORITHM_ED25519), seed))}`,
    verifierKey: `${label}+${encodeBase64(publicKey)}`,
  });
};
