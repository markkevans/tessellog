import { ed25519 } from "@noble/curves/ed25519";
import { concatBytes } from "@noble/hashes/utils";
import { encodeBase64 } from "./base64.js";
import { keyLabel } from "./note-format.js";
import {
  checkKeyId,
  computeKeyId,
  ed25519SignerFields,
  ed25519VerifierFields,
  splitKey,
  verifyEd25519,
  type NoteSigner,
  type NoteVerifier,
} from "./note-keys.js";
import { success, type Result } from "./result.js";

const ALGORITHM_COSIGNATURE_V1 = 0x04;
const TIMESTAMP_BYTES = 8;

export type Clock = () => number;

const nowInSeconds: Clock = () => Math.floor(Date.now() / 1000);

const cosignatureKey = (publicKey: Uint8Array): Uint8Array =>
  concatBytes(Uint8Array.of(ALGORITHM_COSIGNATURE_V1), publicKey);

const cosignedMessage = (timestamp: bigint, message: Uint8Array): Uint8Array =>
  concatBytes(new TextEncoder().encode(`cosignature/v1\ntime ${timestamp}\n`), message);

const encodeTimestamp = (timestamp: bigint): Uint8Array => {
  const bytes = new Uint8Array(TIMESTAMP_BYTES);
  new DataView(bytes.buffer).setBigUint64(0, timestamp);
  return bytes;
};

export const parseCosignerVerifierKey = (vkey: string): Result<NoteVerifier> => {
  const fields = splitKey(vkey, {
    algorithm: ALGORITHM_COSIGNATURE_V1,
    unsupported: (name) => `${name} is not an Ed25519 cosignature (0x04) key`,
  });
  if (!fields.ok) {
    return fields;
  }
  const { name, keyId, keyMaterial } = fields.value;
  const publicKey = keyMaterial.slice(1);
  return checkKeyId(fields.value, keyMaterial, () => ({
    name,
    keyId,
    verify: async (message: Uint8Array, signature: Uint8Array) =>
      signature.length > TIMESTAMP_BYTES &&
      verifyEd25519(
        signature.slice(TIMESTAMP_BYTES),
        cosignedMessage(new DataView(signature.buffer, signature.byteOffset).getBigUint64(0), message),
        publicKey,
      ),
  }));
};

export const cosignatureVerifierKeyFrom = (vkey: string): Result<string> => {
  const fields = ed25519VerifierFields(vkey);
  if (!fields.ok) {
    return fields;
  }
  const { name, publicKey } = fields.value;
  const key = cosignatureKey(publicKey);
  return success(`${keyLabel({ name, keyId: computeKeyId(name, key) })}+${encodeBase64(key)}`);
};

export const parseCosignerKey = (
  skey: string,
  { clock = nowInSeconds }: { readonly clock?: Clock } = {},
): Result<NoteSigner> => {
  const fields = ed25519SignerFields(skey);
  if (!fields.ok) {
    return fields;
  }
  const { name, seed } = fields.value;
  return success({
    name,
    keyId: computeKeyId(name, cosignatureKey(ed25519.getPublicKey(seed))),
    sign: async (message: Uint8Array) => {
      const timestamp = BigInt(clock());
      return concatBytes(encodeTimestamp(timestamp), ed25519.sign(cosignedMessage(timestamp, message), seed));
    },
  });
};
