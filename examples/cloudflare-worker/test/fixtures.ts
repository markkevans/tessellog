import { generateNoteKey, type Result } from "@tessellog/core";

export const ORIGIN = "example.com/worker-log";

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

export const freshKeys = () => unwrap(generateNoteKey({ name: ORIGIN }));
