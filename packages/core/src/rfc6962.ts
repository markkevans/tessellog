import { p256 } from "@noble/curves/nist";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes, hexToBytes } from "@noble/hashes/utils";
import { encodeBase64 } from "./base64.js";
import { parseCheckpoint } from "./checkpoint.js";
import { keyLabel } from "./note-format.js";
import { isValidKeyName, splitKeyParts, type NoteSigner, type NoteVerifier } from "./note-keys.js";
import { failure, success, type Result } from "./result.js";

const ALGORITHM_RFC6962_STH = 0x05;
const HASH_SHA256 = 0x04;
const SIGNATURE_ECDSA = 0x03;
const TIMESTAMP_BYTES = 8;
const SIGNATURE_HEADER_BYTES = 4;
const P256_SPKI_PREFIX = hexToBytes("3059301306072a8648ce3d020106082a8648ce3d030107034200");
const P256_SPKI_BYTES = P256_SPKI_PREFIX.length + 65;

const isP256PublicKeyInfo = (der: Uint8Array): boolean =>
  der.length === P256_SPKI_BYTES && P256_SPKI_PREFIX.every((byte, i) => der[i] === byte);

const keyIdOf = (name: string, publicKeyInfo: Uint8Array): number =>
  new DataView(
    sha256(concatBytes(new TextEncoder().encode(`${name}\n`), Uint8Array.of(ALGORITHM_RFC6962_STH), sha256(publicKeyInfo)))
      .buffer,
  ).getUint32(0);

const uint64 = (value: bigint): Uint8Array => {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value);
  return bytes;
};

const treeHeadSignatureInput = (name: string, timestamp: bigint, message: Uint8Array): Uint8Array | undefined => {
  const checkpoint = parseCheckpoint(new TextDecoder().decode(message));
  if (!checkpoint.ok || checkpoint.value.origin !== name || checkpoint.value.extensions.length > 0) {
    return undefined;
  }
  return concatBytes(Uint8Array.of(0, 1), uint64(timestamp), uint64(checkpoint.value.size), checkpoint.value.rootHash);
};

export const parseRFC6962VerifierKey = (vkey: string): Result<NoteVerifier> => {
  const parts = splitKeyParts(vkey);
  if (!parts.ok) {
    return parts;
  }
  const { name, keyId, keyMaterial } = parts.value;
  const publicKeyInfo = keyMaterial.slice(1);
  if (keyMaterial[0] !== ALGORITHM_RFC6962_STH || !isP256PublicKeyInfo(publicKeyInfo)) {
    return failure(`${name}: only ECDSA P-256 RFC 6962 keys are supported`);
  }
  if (keyIdOf(name, publicKeyInfo) !== keyId) {
    return failure(`key ID does not match key for ${name}`);
  }
  const point = publicKeyInfo.slice(P256_SPKI_PREFIX.length);
  return success({
    name,
    keyId,
    verify: async (message: Uint8Array, signature: Uint8Array) => {
      if (signature.length < TIMESTAMP_BYTES + SIGNATURE_HEADER_BYTES) {
        return false;
      }
      const view = new DataView(signature.buffer, signature.byteOffset);
      const der = signature.slice(TIMESTAMP_BYTES + SIGNATURE_HEADER_BYTES);
      const input = treeHeadSignatureInput(name, view.getBigUint64(0), message);
      return (
        signature[TIMESTAMP_BYTES] === HASH_SHA256 &&
        signature[TIMESTAMP_BYTES + 1] === SIGNATURE_ECDSA &&
        view.getUint16(TIMESTAMP_BYTES + 2) === der.length &&
        input !== undefined &&
        p256.verify(der, sha256(input), point, { prehash: false, lowS: false, format: "der" })
      );
    },
  });
};

export const p256PublicKeyInfo = (privateKey: Uint8Array): Uint8Array =>
  concatBytes(P256_SPKI_PREFIX, p256.getPublicKey(privateKey, false));

export const rfc6962VerifierKey = ({
  logUrl,
  publicKey,
}: {
  readonly logUrl: string;
  readonly publicKey: Uint8Array;
}): Result<string> => {
  const name = logUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return isValidKeyName(name)
    ? success(
        `${keyLabel({ name, keyId: keyIdOf(name, publicKey) })}+${encodeBase64(
          concatBytes(Uint8Array.of(ALGORITHM_RFC6962_STH), publicKey),
        )}`,
      )
    : failure(`invalid log name ${name}`);
};

export const createRFC6962Signer = ({
  name,
  privateKey,
  clock = Date.now,
}: {
  readonly name: string;
  readonly privateKey: Uint8Array;
  readonly clock?: () => number;
}): Result<NoteSigner> => {
  if (!isValidKeyName(name)) {
    return failure(`invalid signer name ${name}`);
  }
  return success({
    name,
    keyId: keyIdOf(name, p256PublicKeyInfo(privateKey)),
    sign: async (message: Uint8Array) => {
      const timestamp = BigInt(clock());
      const input = treeHeadSignatureInput(name, timestamp, message);
      if (input === undefined) {
        throw new Error(`RFC 6962 signers can only sign checkpoints for ${name} without extensions`);
      }
      const der = p256.sign(sha256(input), privateKey, { prehash: false }).toBytes("der");
      const header = new Uint8Array(SIGNATURE_HEADER_BYTES);
      new DataView(header.buffer).setUint16(2, der.length);
      header.set([HASH_SHA256, SIGNATURE_ECDSA], 0);
      return concatBytes(uint64(timestamp), header, der);
    },
  });
};
