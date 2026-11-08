import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes } from "@noble/hashes/utils";
import { decodeBase64 } from "./base64.js";
import { failure, success, type Result } from "./result.js";

const ALGORITHM_ED25519 = 0x01;
const ED25519_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;
const SIGNER_KEY_PREFIX = "PRIVATE+KEY+";
const KEY_ID_HEX = /^[0-9a-fA-F]{8}$/;
const WHITESPACE = /\p{White_Space}/u;

export interface NoteSigner {
  readonly name: string;
  readonly keyId: number;
  sign(message: Uint8Array): Promise<Uint8Array>;
}

export interface NoteVerifier {
  readonly name: string;
  readonly keyId: number;
  verify(message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}

export type KeyFields = {
  readonly name: string;
  readonly keyId: number;
  readonly keyMaterial: Uint8Array;
};

export const isValidKeyName = (name: string): boolean =>
  name !== "" && !name.includes("+") && !WHITESPACE.test(name);

export const computeKeyId = (name: string, publicKey: Uint8Array): number =>
  new DataView(
    sha256(concatBytes(new TextEncoder().encode(`${name}\n`), publicKey)).buffer,
  ).getUint32(0);

type KeyAlgorithm = {
  readonly algorithm: number;
  readonly unsupported: (name: string) => string;
};

const ED25519: KeyAlgorithm = {
  algorithm: ALGORITHM_ED25519,
  unsupported: (name) => `unsupported key encoding for ${name}`,
};

export const splitKey = (key: string, { algorithm, unsupported }: KeyAlgorithm): Result<KeyFields> => {
  const [name = "", keyIdHex = "", ...rest] = key.split("+");
  const encoded = rest.join("+");
  if (rest.length === 0 || !isValidKeyName(name) || !KEY_ID_HEX.test(keyIdHex)) {
    return failure(`malformed key ${key}`);
  }
  const keyMaterial = decodeBase64(encoded);
  if (keyMaterial === undefined || keyMaterial[0] !== algorithm) {
    return failure(unsupported(name));
  }
  if (keyMaterial.length !== ED25519_KEY_BYTES + 1) {
    return failure(`wrong key length for ${name}`);
  }
  return success({ name, keyId: parseInt(keyIdHex, 16), keyMaterial });
};

export const checkKeyId = <T>(
  { name, keyId }: KeyFields,
  publicKey: Uint8Array,
  build: () => T,
): Result<T> =>
  computeKeyId(name, publicKey) === keyId
    ? success(build())
    : failure(`key ID does not match key for ${name}`);

const ed25519PublicKey = (raw: Uint8Array): Uint8Array =>
  concatBytes(Uint8Array.of(ALGORITHM_ED25519), raw);

export type VerifierKeyFields = {
  readonly name: string;
  readonly keyId: number;
  readonly publicKey: Uint8Array;
};

export type SignerKeyFields = {
  readonly name: string;
  readonly keyId: number;
  readonly seed: Uint8Array;
};

export const verifyEd25519 = (
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean =>
  signature.length === ED25519_SIGNATURE_BYTES &&
  ed25519.verify(signature, message, publicKey, { zip215: false });

export const ed25519VerifierFields = (vkey: string): Result<VerifierKeyFields> => {
  const fields = splitKey(vkey, ED25519);
  if (!fields.ok) {
    return fields;
  }
  const { name, keyId, keyMaterial } = fields.value;
  return checkKeyId(fields.value, keyMaterial, () => ({ name, keyId, publicKey: keyMaterial.slice(1) }));
};

export const ed25519SignerFields = (skey: string): Result<SignerKeyFields> => {
  if (!skey.startsWith(SIGNER_KEY_PREFIX)) {
    return failure("signer key must start with PRIVATE+KEY+");
  }
  const fields = splitKey(skey.slice(SIGNER_KEY_PREFIX.length), ED25519);
  if (!fields.ok) {
    return fields;
  }
  const { name, keyId, keyMaterial } = fields.value;
  const seed = keyMaterial.slice(1);
  return checkKeyId(fields.value, ed25519PublicKey(ed25519.getPublicKey(seed)), () => ({
    name,
    keyId,
    seed,
  }));
};

export const parseVerifierKey = (vkey: string): Result<NoteVerifier> => {
  const fields = ed25519VerifierFields(vkey);
  if (!fields.ok) {
    return fields;
  }
  const { name, keyId, publicKey } = fields.value;
  return success({
    name,
    keyId,
    verify: async (message: Uint8Array, signature: Uint8Array) =>
      verifyEd25519(signature, message, publicKey),
  });
};

export const parseSignerKey = (skey: string): Result<NoteSigner> => {
  const fields = ed25519SignerFields(skey);
  if (!fields.ok) {
    return fields;
  }
  const { name, keyId, seed } = fields.value;
  return success({
    name,
    keyId,
    sign: async (message: Uint8Array) => ed25519.sign(message, seed),
  });
};
