import { decodeBase64, type NoteVerifier } from "@tessellog/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryWitnessStore,
  createWitness,
  createWitnessClient,
  type Witness,
  type WitnessStore,
} from "../src/index.js";
import {
  addCheckpointBody,
  logVerifier,
  ORIGIN,
  proofLines,
  signedCheckpoint,
  witnessCosigner,
  witnessVerifier,
} from "./fixtures/log.js";

const PREFIX = "https://witness.example/submit";

afterEach(() => {
  vi.unstubAllGlobals();
});

const witnessWith = (store: WitnessStore = createMemoryWitnessStore()): Witness =>
  createWitness({
    cosigners: [witnessCosigner()],
    logs: [{ origin: ORIGIN, verifiers: [logVerifier()] }],
    store,
  });

const fetchTo =
  (witness: Witness, requested: string[] = []): typeof fetch =>
  async (input, init) => {
    requested.push(String(input));
    return witness.handle(new Request(String(input), init));
  };

const proofTo =
  (size: number, requestedFrom: bigint[] = []) =>
  async (oldSize: bigint): Promise<readonly Uint8Array[]> => {
    requestedFrom.push(oldSize);
    return proofLines(Number(oldSize), size).map((line) => decodeBase64(line) ?? new Uint8Array());
  };

const clientFor = (witness: Witness, verifier: NoteVerifier = witnessVerifier(), requested: string[] = []) =>
  createWitnessClient({ url: PREFIX, verifier, fetch: fetchTo(witness, requested) });

const submit = async (client: ReturnType<typeof clientFor>, size: number, requestedFrom: bigint[] = []) =>
  client.addCheckpoint({
    checkpoint: await signedCheckpoint({ size }),
    size: BigInt(size),
    proof: proofTo(size, requestedFrom),
  });

describe("submitting checkpoints to a witness", () => {
  it("returns the witness's verified cosignature", async () => {
    const result = await submit(clientFor(witnessWith()), 5);
    expect(result.ok && result.value).toMatch(/^— WitnessOne [A-Za-z0-9+/=]+\n$/);
  });

  it("posts to add-checkpoint under the submission prefix", async () => {
    const requested: string[] = [];
    await submit(clientFor(witnessWith(), witnessVerifier(), requested), 5);
    expect(requested).toEqual([`${PREFIX}/add-checkpoint`]);
  });

  it("accepts a submission prefix that already ends with a slash", async () => {
    const requested: string[] = [];
    const client = createWitnessClient({
      url: `${PREFIX}/`,
      verifier: witnessVerifier(),
      fetch: fetchTo(witnessWith(), requested),
    });
    await submit(client, 5);
    expect(requested).toEqual([`${PREFIX}/add-checkpoint`]);
  });

  it("uses the global fetch when none is given", async () => {
    vi.stubGlobal("fetch", fetchTo(witnessWith()));
    const result = await submit(createWitnessClient({ url: PREFIX, verifier: witnessVerifier() }), 5);
    expect(result.ok).toBe(true);
  });

  it("proves later checkpoints from the size the witness last cosigned", async () => {
    const client = clientFor(witnessWith());
    const requestedFrom: bigint[] = [];
    await submit(client, 5);
    const result = await submit(client, 300, requestedFrom);
    expect(result.ok).toBe(true);
    expect(requestedFrom).toEqual([5n]);
  });

  it("retries from the witness's size after a conflict", async () => {
    const witness = witnessWith();
    await witness.handle(
      new Request(`${PREFIX}/add-checkpoint`, { method: "POST", body: await addCheckpointBody(0, { size: 5 }) }),
    );
    const requestedFrom: bigint[] = [];
    const result = await submit(clientFor(witness), 10, requestedFrom);
    expect(result.ok).toBe(true);
    expect(requestedFrom).toEqual([5n]);
  });
});

describe("failing to obtain a cosignature", () => {
  it("gives up when the witness conflicts twice", async () => {
    let size = 0n;
    const shifting: WitnessStore = {
      latest: async () => {
        size += 1n;
        return { size, rootHash: new Uint8Array(32) };
      },
      advance: async () => false,
    };
    expect(await submit(clientFor(witnessWith(shifting)), 10)).toEqual({
      ok: false,
      error: "witness WitnessOne kept reporting a different size",
    });
  });

  it("refuses to roll the witness back when it has cosigned a larger tree", async () => {
    const witness = witnessWith();
    await submit(clientFor(witness), 10);
    expect(await submit(clientFor(witness), 5)).toEqual({
      ok: false,
      error: "witness WitnessOne has cosigned a larger tree (10) than this checkpoint (5)",
    });
  });

  it("reports the witness's status when it refuses the checkpoint", async () => {
    const strangers = createWitness({ cosigners: [witnessCosigner()], logs: [], store: createMemoryWitnessStore() });
    expect(await submit(clientFor(strangers), 5)).toEqual({
      ok: false,
      error: "witness WitnessOne refused the checkpoint with status 404: unknown log PeterNeumann",
    });
  });

  it("rejects cosignatures that do not verify with the witness's key", async () => {
    expect(await submit(clientFor(witnessWith(), logVerifier()), 5)).toEqual({
      ok: false,
      error: "witness PeterNeumann returned no valid cosignature",
    });
  });

  it("reports a witness that cannot be reached", async () => {
    const client = createWitnessClient({
      url: PREFIX,
      verifier: witnessVerifier(),
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(await submit(client, 5)).toEqual({ ok: false, error: "witness WitnessOne is unreachable: fetch failed" });
  });
});
