const KEY_ID_BYTES = 4;
const CONTROL_EXCEPT_NEWLINE = /[\x00-\x09\x0b-\x1f]/;

export const SIGNATURE_PREFIX = "— ";
export const MALFORMED_NOTE = "malformed note";

export const hasControlCharacters = (text: string): boolean =>
  CONTROL_EXCEPT_NEWLINE.test(text);

export const encodeKeyId = (keyId: number): Uint8Array =>
  Uint8Array.of(keyId >>> 24, (keyId >>> 16) & 0xff, (keyId >>> 8) & 0xff, keyId & 0xff);

export const splitKeyIdPrefix = (
  raw: Uint8Array,
): { readonly keyId: number; readonly signature: Uint8Array } | undefined =>
  raw.length > KEY_ID_BYTES
    ? {
        keyId: new DataView(raw.buffer, raw.byteOffset).getUint32(0),
        signature: raw.slice(KEY_ID_BYTES),
      }
    : undefined;

export type KeyReference = { readonly name: string; readonly keyId: number };

export const sameKey = (a: KeyReference, b: KeyReference): boolean =>
  a.name === b.name && a.keyId === b.keyId;

export const keyLabel = ({ name, keyId }: KeyReference): string =>
  `${name}+${keyId.toString(16).padStart(8, "0")}`;
