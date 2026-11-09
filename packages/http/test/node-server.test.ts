import { createAppender, createMemoryDriver } from "@tessellog/appender";
import { generateNoteKey, parseSignerKey, type Result } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { createLogHandler } from "../src/index.js";
import { serveNode, type RunningServer } from "../src/node.js";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const withServer = async (test: (server: RunningServer) => Promise<void>): Promise<void> => {
  const appender = createAppender({
    driver: createMemoryDriver(),
    signer: unwrap(parseSignerKey(unwrap(generateNoteKey({ name: "example.com/log" })).signerKey)),
    checkpointInterval: 10,
  });
  const server = await serveNode({
    handler: createLogHandler({ appender }),
    port: 0,
    host: "127.0.0.1",
    onError: console.error,
  });
  try {
    await test(server);
  } finally {
    await server.close();
    await appender.shutdown();
  }
};

const add = (server: RunningServer, body: string | Uint8Array<ArrayBuffer>): Promise<Response> =>
  fetch(new URL("add", server.url), { method: "POST", body });

describe("serving a log handler with node:http", () => {
  it("passes requests through and answers with the handler's response", () =>
    withServer(async (server) => {
      const response = await add(server, "alpha");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("0\n");
      const checkpoint = await fetch(new URL("checkpoint", server.url));
      expect(checkpoint.headers.get("cache-control")).toBe("no-cache");
    }));

  it("stops reading an oversized body and keeps serving", () =>
    withServer(async (server) => {
      expect((await add(server, new Uint8Array(65_536))).status).toBe(413);
      expect((await add(server, "alpha")).status).toBe(200);
    }));

  it("normalises paths before routing them", () =>
    withServer(async (server) => {
      await add(server, "alpha");
      expect((await fetch(new URL("/tile/0/../../checkpoint", server.url))).status).toBe(200);
      expect((await fetch(new URL("/tile/0/../../.state/lock", server.url))).status).toBe(404);
    }));
});
