import type { LogDriver } from "./driver.js";

export const createMemoryDriver = (): LogDriver => {
  let sequenced: readonly Uint8Array[] = [];
  return {
    sequence: async (entries) => {
      const firstIndex = BigInt(sequenced.length);
      sequenced = [...sequenced, ...entries];
      return firstIndex;
    },
  };
};
