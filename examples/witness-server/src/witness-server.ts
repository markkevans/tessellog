import type { NoteSigner } from "@tessellog/core";
import { openPosixWitnessStore } from "@tessellog/driver-posix";
import { serveNode } from "@tessellog/http/node";
import { createWitness, type WitnessedLog } from "@tessellog/witness";

export type WitnessServerOptions = {
  readonly storageDir: string;
  readonly cosigner: NoteSigner;
  readonly logs: readonly WitnessedLog[];
  readonly port?: number;
  readonly host?: string;
  readonly onError?: (error: unknown) => void;
};

export type WitnessServer = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

const DEFAULT_PORT = 2025;
const DEFAULT_HOST = "127.0.0.1";

export const startWitnessServer = async ({
  storageDir,
  cosigner,
  logs,
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  onError = console.error,
}: WitnessServerOptions): Promise<WitnessServer> => {
  const store = await openPosixWitnessStore({ root: storageDir });
  const witness = createWitness({ cosigners: [cosigner], logs, store });
  const server = await serveNode({ handler: witness.handle, port, host, onError });
  return {
    url: server.url,
    close: async () => {
      await server.close();
      await store.close();
    },
  };
};
