import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { parseArgs } from "node:util";
import { parseCosignerKey, parseVerifierKey } from "@tessellog/core";
import { createMemoryWitnessStore, createWitness } from "@tessellog/witness";

const fail = (message: string): never => {
  console.error(`witness-server: ${message}`);
  process.exit(1);
};

const { values } = parseArgs({
  options: {
    instance: { type: "string" },
    "log-vkey": { type: "string" },
    "cosigner-key": { type: "string" },
  },
});

const logKey = parseVerifierKey(values["log-vkey"] ?? fail("--log-vkey is required"));
const cosigner = parseCosignerKey(
  (await readFile(values["cosigner-key"] ?? fail("--cosigner-key is required"), "utf8")).trim(),
);
const witness = createWitness({
  cosigners: [cosigner.ok ? cosigner.value : fail(cosigner.error)],
  logs: [{ origin: logKey.ok ? logKey.value.name : fail(logKey.error), verifiers: logKey.ok ? [logKey.value] : [] }],
  store: createMemoryWitnessStore(),
});

const bodyOf = async (request: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> => {
  let chunks: readonly Uint8Array[] = [];
  for await (const chunk of request) {
    chunks = [...chunks, new Uint8Array(chunk)];
  }
  return Uint8Array.from(Buffer.concat(chunks));
};

const server = createServer(async (incoming, outgoing) => {
  const body = await bodyOf(incoming);
  const response = await witness.handle(
    new Request(`http://127.0.0.1${incoming.url ?? "/"}`, {
      method: incoming.method ?? "GET",
      body: incoming.method === "POST" ? body : null,
    }),
  );
  let headers: Readonly<Record<string, string>> = {};
  response.headers.forEach((value, name) => {
    headers = { ...headers, [name]: value };
  });
  outgoing.writeHead(response.status, headers);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : fail("not listening on TCP");
  console.log(`listening http://127.0.0.1:${port}/submit`);
});
