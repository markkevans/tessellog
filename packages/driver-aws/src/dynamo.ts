import { z } from "zod";

export const NumberAttribute = z
  .object({ N: z.string().regex(/^(0|[1-9][0-9]*)$/) })
  .transform(({ N }) => BigInt(N));

export const isAwsError = (error: unknown, name: string): boolean =>
  typeof error === "object" && error !== null && "name" in error && error.name === name;

export const ignoring =
  (name: string) =>
  (error: unknown): undefined => {
    if (isAwsError(error, name)) {
      return undefined;
    }
    throw error;
  };

export const replacing =
  (name: string, replacement: () => Error) =>
  (error: unknown): never => {
    throw isAwsError(error, name) ? replacement() : error;
  };
