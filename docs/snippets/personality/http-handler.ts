import { createAppender } from "@tessellog/appender";
import type { NoteSigner } from "@tessellog/core";
import { openPosixDriver } from "@tessellog/driver-posix";
import { createLogHandler } from "@tessellog/http";
import { serveNode } from "@tessellog/http/node";

export const serveLog = async (signer: NoteSigner) => {
  const driver = await openPosixDriver({ root: "./my-log" });
  const appender = createAppender({ driver, signer, checkpointInterval: 1_000 });
  const server = await serveNode({
    handler: createLogHandler({ appender }),
    port: 2024,
    host: "0.0.0.0",
    onError: console.error,
  });
  console.log(`POST entries to ${server.url}add`);

  process.once("SIGTERM", async () => {
    await server.close();
    await appender.shutdown();
    await driver.close();
  });
};
