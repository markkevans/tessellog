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
