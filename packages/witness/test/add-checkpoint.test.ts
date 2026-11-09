import { openNote, signNote, type NoteSigner } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import {
  createMemoryWitnessStore,
  createWitness,
  type Witness,
  type WitnessStore,
} from "../src/index.js";
import {
  addCheckpointBody,
  logSigner,
  logVerifier,
  ORIGIN,
  otherSigner,
  proofLines,
  signedCheckpoint,
  witnessCosigner,
  witnessVerifier,
} from "./fixtures/log.js";

const URL_BASE = "https://witness.example/submit";

const newWitness = (): Witness =>
  createWitness({
    cosigners: [witnessCosigner()],
    logs: [{ origin: ORIGIN, verifiers: [logVerifier()] }],
    store: createMemoryWitnessStore(),
  });

const submit = (witness: Witness, body: string, path = "/add-checkpoint", method = "POST") =>
  witness.handle(new Request(`${URL_BASE}${path}`, { method, body: method === "POST" ? body : null }));

const cosignedAndVerifies = async (response: Response, size: number): Promise<boolean> => {
  const lines = await response.text();
  const opened = await openNote({
    message: new TextEncoder().encode(`${(await signedCheckpoint({ size })).split("\n\n")[0]}\n\n${lines}`),
    verifiers: [witnessVerifier()],
  });
  return opened.ok && opened.value.verifiedSignatures.length === 1;
};

describe("cosigning checkpoints (tlog-witness add-checkpoint)", () => {
  it("cosigns the first checkpoint it sees for a log", async () => {
    const response = await submit(newWitness(), await addCheckpointBody(0, { size: 5 }));
    expect(response.status).toBe(200);
    expect(await cosignedAndVerifies(response, 5)).toBe(true);
  });

  it("cosigns a checkpoint proven consistent with the last one it cosigned", async () => {
    const witness = newWitness();
    await submit(witness, await addCheckpointBody(0, { size: 5 }));
    const response = await submit(witness, await addCheckpointBody(5, { size: 300 }));
    expect(response.status).toBe(200);
    expect(await cosignedAndVerifies(response, 300)).toBe(true);
  });

  it("cosigns the same checkpoint again", async () => {
    const witness = newWitness();
    await submit(witness, await addCheckpointBody(0, { size: 5 }));
    expect((await submit(witness, await addCheckpointBody(5, { size: 5 }))).status).toBe(200);
  });
});

describe("refusing checkpoints (tlog-witness add-checkpoint)", () => {
  it("reports its own size when the old size does not match", async () => {
    const witness = newWitness();
    await submit(witness, await addCheckpointBody(0, { size: 5 }));
    const response = await submit(witness, await addCheckpointBody(3, { size: 10 }));
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toBe("text/x.tlog.size");
    expect(await response.text()).toBe("5\n");
  });

  it("lets exactly one of two racing submissions from the same size win", async () => {
    const witness = newWitness();
    const [a, b] = await Promise.all([
      submit(witness, await addCheckpointBody(0, { size: 5 })),
      submit(witness, await addCheckpointBody(0, { size: 7 })),
    ]);
    expect([a?.status, b?.status].sort()).toEqual([200, 409]);
  });

  it.each<[string, () => Promise<string>]>([
    ["an old size larger than the checkpoint", async () => addCheckpointBody(6, { size: 5 }, [])],
    ["no blank line before the checkpoint", async () => `old 0\n${await signedCheckpoint({ size: 5 })}`],
    ["an old line that is not canonical", async () => (await addCheckpointBody(0, { size: 5 })).replace("old 0", "old 00")],
    ["a proof line that is not base64", async () => addCheckpointBody(0, { size: 5 }, ["not*base64"])],
    [
      "more than 63 proof lines",
      async () => addCheckpointBody(0, { size: 5 }, Array.from({ length: 64 }, () => "AAAA")),
    ],
    [
      "a signed note that is not a checkpoint",
      async () => {
        const signed = await signNote({ text: `${ORIGIN}\nnot a size\n`, signers: [logSigner()] });
        return `old 0\n\n${signed.ok ? signed.value : ""}`;
      },
    ],
  ])("rejects %s as a bad request", async (_, body) => {
    expect((await submit(newWitness(), await body())).status).toBe(400);
  });

  it("rejects a body that is not UTF-8 as a bad request", async () => {
    const witness = newWitness();
    const response = await witness.handle(
      new Request(`${URL_BASE}/add-checkpoint`, { method: "POST", body: Uint8Array.of(0xff, 0x0a, 0x0a) }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a body with no blank line at all as a bad request", async () => {
    expect((await submit(newWitness(), "old 0\n")).status).toBe(400);
  });

  it("rejects a checkpoint section that is not a well-formed note as a bad request", async () => {
    const unsigned = (await signedCheckpoint({ size: 5 })).split("\n\n")[0] ?? "";
    expect((await submit(newWitness(), `old 0\n\n${unsigned}\n`)).status).toBe(400);
  });

  it("does not know logs it is not configured for", async () => {
    const body = (await addCheckpointBody(0, { size: 5 })).replace(/^PeterNeumann$/m, "elsewhere.org/log");
    expect((await submit(newWitness(), body)).status).toBe(404);
  });

  it("refuses a checkpoint no trusted log key signed", async () => {
    expect((await submit(newWitness(), await addCheckpointBody(0, { size: 5, signer: otherSigner() }))).status).toBe(403);
  });

  it("refuses a checkpoint whose trusted signature does not verify", async () => {
    const body = (await addCheckpointBody(0, { size: 5 })).replace(/\n5\n/, "\n6\n");
    expect((await submit(newWitness(), body)).status).toBe(403);
  });

  it.each<[string, (witness: Witness) => Promise<Response>]>([
    [
      "a consistency proof that does not verify",
      async (witness) => {
        await submit(witness, await addCheckpointBody(0, { size: 5 }));
        return submit(witness, await addCheckpointBody(5, { size: 10, label: "forked" }, proofLines(5, 10)));
      },
    ],
    ["a proof sent with an old size of zero", async (witness) => submit(witness, await addCheckpointBody(0, { size: 5 }, proofLines(2, 5)))],
    [
      "the same size with a different root",
      async (witness) => {
        await submit(witness, await addCheckpointBody(0, { size: 5 }));
        return submit(witness, await addCheckpointBody(5, { size: 5, label: "forked" }, []));
      },
    ],
    [
      "an empty checkpoint without the empty root",
      async (witness) => {
        const signed = await signNote({
          text: `${ORIGIN}\n0\nXcnaeacGWamtVZy3Ad7ZoqudgjqtL0lgz+Nw7/RgQyg=\n`,
          signers: [logSigner()],
        });
        return submit(witness, `old 0\n\n${signed.ok ? signed.value : ""}`);
      },
    ],
  ])("refuses %s as unprocessable", async (_, attempt) => {
    expect((await attempt(newWitness())).status).toBe(422);
  });

  it("does not move its size after refusing a checkpoint", async () => {
    const witness = newWitness();
    await submit(witness, await addCheckpointBody(0, { size: 5 }));
    await submit(witness, await addCheckpointBody(5, { size: 10, label: "forked" }, proofLines(5, 10)));
    expect((await submit(witness, await addCheckpointBody(5, { size: 10 }))).status).toBe(200);
  });

  it("only serves add-checkpoint", async () => {
    expect((await submit(newWitness(), "", "/other")).status).toBe(404);
  });

  it("only accepts POST", async () => {
    expect((await submit(newWitness(), "", "/add-checkpoint", "GET")).status).toBe(405);
  });
});

describe("handling races and misconfiguration", () => {
  it("reports the store's size when another submission advanced it first", async () => {
    const lostRace: WitnessStore = {
      latest: async () => undefined,
      advance: async () => false,
    };
    const witness = createWitness({
      cosigners: [witnessCosigner()],
      logs: [{ origin: ORIGIN, verifiers: [logVerifier()] }],
      store: lostRace,
    });
    const response = await submit(witness, await addCheckpointBody(0, { size: 5 }));
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("0\n");
  });

  it("reports the winning size when another submission advanced the store first", async () => {
    let calls = 0;
    const raced: WitnessStore = {
      latest: async () => {
        calls += 1;
        return calls === 1 ? undefined : { size: 7n, rootHash: new Uint8Array(32) };
      },
      advance: async () => false,
    };
    const witness = createWitness({
      cosigners: [witnessCosigner()],
      logs: [{ origin: ORIGIN, verifiers: [logVerifier()] }],
      store: raced,
    });
    expect(await (await submit(witness, await addCheckpointBody(0, { size: 5 }))).text()).toBe("7\n");
  });

  it("fails with a server error when it cannot cosign", async () => {
    const misnamed: NoteSigner = { ...witnessCosigner(), name: "Witness One" };
    const witness = createWitness({
      cosigners: [misnamed],
      logs: [{ origin: ORIGIN, verifiers: [logVerifier()] }],
      store: createMemoryWitnessStore(),
    });
    expect((await submit(witness, await addCheckpointBody(0, { size: 5 }))).status).toBe(500);
  });
});

describe("storing witnessed checkpoints", () => {
  it("refuses to advance from a size it is not at", async () => {
    const store = createMemoryWitnessStore();
    expect(await store.advance(ORIGIN, 3n, { size: 5n, rootHash: new Uint8Array(32) })).toBe(false);
    expect(await store.latest(ORIGIN)).toBeUndefined();
  });
});
