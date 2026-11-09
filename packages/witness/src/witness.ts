import {
  openNote,
  parseCheckpoint,
  rootHash,
  signNote,
  toHex,
  verifyConsistency,
  type Checkpoint,
  type NoteSigner,
  type NoteVerifier,
} from "@tessellog/core";
import { parseAddCheckpoint, type AddCheckpointRequest } from "./request.js";
import type { WitnessStore } from "./store.js";

export type WitnessedLog = {
  readonly origin: string;
  readonly verifiers: readonly NoteVerifier[];
};

export type WitnessOptions = {
  readonly cosigners: readonly NoteSigner[];
  readonly logs: readonly WitnessedLog[];
  readonly store: WitnessStore;
};

export type Witness = {
  readonly handle: (request: Request) => Promise<Response>;
};

const EMPTY_ROOT = toHex(rootHash([]));

const respond = (status: number, body = "", contentType = "text/plain; charset=utf-8"): Response =>
  new Response(body, { status, headers: { "content-type": contentType } });

const conflict = (size: bigint): Response => respond(409, `${size}\n`, "text/x.tlog.size");

const openSubmitted = async (
  request: AddCheckpointRequest,
  verifiers: readonly NoteVerifier[],
): Promise<Checkpoint | Response> => {
  const opened = await openNote({ message: request.checkpoint, verifiers });
  if (!opened.ok) {
    return respond(opened.error === "malformed note" ? 400 : 403, opened.error);
  }
  const checkpoint = parseCheckpoint(opened.value.text);
  return checkpoint.ok ? checkpoint.value : respond(400, checkpoint.error);
};

const inconsistency = (
  request: AddCheckpointRequest,
  checkpoint: Checkpoint,
  previousRoot: Uint8Array,
): string | undefined => {
  if (checkpoint.size === 0n && toHex(checkpoint.rootHash) !== EMPTY_ROOT) {
    return "an empty checkpoint must have the empty root";
  }
  if (request.oldSize === 0n) {
    return request.proof.length === 0 ? undefined : "no proof is needed from an old size of zero";
  }
  const verified = verifyConsistency({
    oldSize: request.oldSize,
    newSize: checkpoint.size,
    oldRoot: previousRoot,
    newRoot: checkpoint.rootHash,
    proof: request.proof,
  });
  return verified.ok ? undefined : verified.error;
};

const cosign = async (cosigners: readonly NoteSigner[], text: string): Promise<Response> => {
  const signed = await signNote({ text, signers: cosigners });
  return signed.ok ? respond(200, signed.value.slice(text.length + 1)) : respond(500, signed.error);
};

const addCheckpoint = async (
  { cosigners, logs, store }: WitnessOptions,
  body: Uint8Array,
): Promise<Response> => {
  const request = parseAddCheckpoint(body);
  if (!request.ok) {
    return respond(400, request.error);
  }
  const log = logs.find(({ origin }) => origin === request.value.origin);
  if (log === undefined) {
    return respond(404, `unknown log ${request.value.origin}`);
  }
  const checkpoint = await openSubmitted(request.value, log.verifiers);
  if (checkpoint instanceof Response) {
    return checkpoint;
  }
  if (request.value.oldSize > checkpoint.size) {
    return respond(400, "old size is larger than the checkpoint");
  }
  const previous = (await store.latest(log.origin)) ?? { size: 0n, rootHash: rootHash([]) };
  if (request.value.oldSize !== previous.size) {
    return conflict(previous.size);
  }
  const problem = inconsistency(request.value, checkpoint, previous.rootHash);
  if (problem !== undefined) {
    return respond(422, problem);
  }
  const advanced = await store.advance(log.origin, previous.size, checkpoint);
  if (!advanced) {
    return conflict((await store.latest(log.origin))?.size ?? 0n);
  }
  return cosign(cosigners, new TextDecoder().decode(request.value.checkpoint).split("\n\n")[0] + "\n");
};

export const createWitness = (options: WitnessOptions): Witness => ({
  handle: async (request) => {
    if (!new URL(request.url).pathname.endsWith("/add-checkpoint")) {
      return respond(404, "not found");
    }
    if (request.method !== "POST") {
      return respond(405, "add-checkpoint requires POST");
    }
    return addCheckpoint(options, new Uint8Array(await request.arrayBuffer()));
  },
});
