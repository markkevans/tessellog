const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const encodeBase64 = (bytes: Uint8Array): string =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));

export const decodeBase64 = (text: string): Uint8Array | undefined => {
  if (!BASE64.test(text)) {
    return undefined;
  }
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  return encodeBase64(bytes) === text ? bytes : undefined;
};
