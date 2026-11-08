import type { LogDriver } from "./driver.js";

export type AddResult = {
  readonly index: bigint;
  readonly isDup: boolean;
};

export type Appender = {
  readonly add: (entry: Uint8Array) => Promise<AddResult>;
};

export const createAppender = ({ driver }: { readonly driver: LogDriver }): Appender => ({
  add: async (entry) => ({ index: await driver.sequence([entry]), isDup: false }),
});
