export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

export const success = <T>(value: T): Result<T> => ({ ok: true, value });

export const failure = <T>(error: string): Result<T> => ({ ok: false, error });
