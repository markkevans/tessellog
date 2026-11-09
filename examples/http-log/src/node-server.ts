import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import type { LogHandler } from "./handler.js";

export type RunningServer = {
  readonly url: string;
  readonly close: () => Promise<void>;
};

const ListeningAddress = z.object({ port: z.number().int() });

const requestBody = (request: IncomingMessage): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start: (controller) => {
      request.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      request.on("end", controller.close.bind(controller));
      request.on("error", controller.error.bind(controller));
    },
    cancel: () => {
      request.removeAllListeners("data");
      request.removeAllListeners("end");
      request.resume();
    },
  });

const toRequest = (request: IncomingMessage, origin: string): Request =>
  new Request(new URL(`${request.url}`, origin), {
    method: `${request.method}`,
    ...(request.method === "POST" ? { body: requestBody(request), duplex: "half" } : {}),
  });

const send = async (response: Response, target: ServerResponse): Promise<void> => {
  response.headers.forEach((value, name) => target.setHeader(name, value));
  target.writeHead(response.status);
  target.end(new Uint8Array(await response.arrayBuffer()));
};

export const serve = async ({
  handler,
  port,
  host,
  onError,
}: {
  readonly handler: LogHandler;
  readonly port: number;
  readonly host: string;
  readonly onError: (error: unknown) => void;
}): Promise<RunningServer> => {
  const server = createServer((request, response) => {
    handler(toRequest(request, `http://${host}`))
      .then((answer) => send(answer, response))
      .catch(onError);
  });
  server.listen(port, host);
  await once(server, "listening");
  const { port: bound } = ListeningAddress.parse(server.address());
  return {
    url: `http://${host}:${bound}/`,
    close: async () => {
      server.close();
      server.closeAllConnections();
      await once(server, "close");
    },
  };
};
