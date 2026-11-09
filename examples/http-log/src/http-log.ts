import { createAppender, type AppenderOptions } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { createLogHandler } from "./handler.js";
import { serve } from "./node-server.js";

export type HttpLogOptions = {
  readonly storageDir: string;
  readonly signer: NoteSigner;
  readonly port?: number;
  readonly host?: string;
  readonly appender?: Partial<Omit<AppenderOptions, "driver" | "signer">>;
  readonly onError?: (error: unknown) => void;
};

export type HttpLog = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

const DEFAULT_PORT = 2024;
const DEFAULT_HOST = "127.0.0.1";

export const startHttpLog = async ({
  storageDir,
  signer,
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  appender: appenderOptions = {},
  onError = console.error,
}: HttpLogOptions): Promise<HttpLog> => {
  const driver = await openPosixDriver({ root: storageDir });
  const appender = createAppender({ ...appenderOptions, driver, signer });
  const server = await serve({ handler: createLogHandler({ appender, onError }), port, host, onError });
  return {
    url: server.url,
    close: async () => {
      await server.close();
      await appender.shutdown();
      await driver.close();
    },
  };
};
