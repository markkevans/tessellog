import { parseCosignerKey, parsePolicy, type Policy } from "@tessellog/core";
import { createMemoryWitnessStore, createWitness } from "@tessellog/witness";
import { describe, expect, it } from "vitest";
import { clientFor } from "./fixtures/client.js";
import { LOG_KEY_NAME, logVerifier } from "./fixtures/keys.js";
import { entriesFor, servedLog } from "./fixtures/served-log.js";

const W1_URL = "https://w1.example/submit";
const W1_SKEY = "PRIVATE+KEY+WitnessOne+73f152b1+AaA1V+rFd0kL2T2VE6eN8l3w436FpdT7Gv8oGE1lCS4H";
const W1_VKEY = "WitnessOne+3f2acfb9+BG/0vdadeZvB98cEdVaMBfkts+OT6iw8cVehe9i4nUTx";
const W2_VKEY = "x1.example/w+404eb6e7+BI7UVG0PQqXiEvOtLy09HbMUsqo7VtvTPnfoEgtBSviu";

const required = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const policy = (text: string): Policy => required(parsePolicy(text));

const witnessedByW1 = () => {
  const witness = createWitness({
    cosigners: [required(parseCosignerKey(W1_SKEY))],
    logs: [{ origin: LOG_KEY_NAME, verifiers: [logVerifier()] }],
    store: createMemoryWitnessStore(),
  });
  return servedLog(entriesFor(5), {
    witnessing: {
      policy: policy(`witness W1 ${W1_VKEY} ${W1_URL}\nquorum W1`),
      fetch: async (input, init) => witness.handle(new Request(String(input), init)),
    },
  });
};

describe("requiring a witness quorum", () => {
  it("opens a checkpoint whose cosignatures satisfy the policy", async () => {
    const { files } = await witnessedByW1();
    const opened = await clientFor(files, { witnessPolicy: policy(`witness W1 ${W1_VKEY}\nquorum W1`) }).latestCheckpoint();
    expect(opened.ok && opened.value.checkpoint.size).toBe(5n);
  });

  it("refuses a checkpoint the policy's witnesses did not cosign", async () => {
    const { files } = await servedLog(entriesFor(5));
    expect(
      await clientFor(files, { witnessPolicy: policy(`witness W1 ${W1_VKEY}\nquorum W1`) }).latestCheckpoint(),
    ).toEqual({ ok: false, error: "checkpoint does not satisfy the witness policy: cosigned by no witnesses" });
  });

  it("does not count cosignatures from witnesses outside the policy", async () => {
    const { files } = await witnessedByW1();
    expect(
      await clientFor(files, { witnessPolicy: policy(`witness W2 ${W2_VKEY}\nquorum W2`) }).latestCheckpoint(),
    ).toEqual({ ok: false, error: "checkpoint does not satisfy the witness policy: cosigned by no witnesses" });
  });

  it("accepts an unwitnessed checkpoint under quorum none", async () => {
    const { files } = await servedLog(entriesFor(5));
    expect((await clientFor(files, { witnessPolicy: policy("quorum none") }).latestCheckpoint()).ok).toBe(true);
  });

  it("names the witnesses that did cosign when the quorum is still short", async () => {
    const { files } = await witnessedByW1();
    const both = policy(`witness W1 ${W1_VKEY}\nwitness W2 ${W2_VKEY}\ngroup both all W1 W2\nquorum both`);
    expect(await clientFor(files, { witnessPolicy: both }).latestCheckpoint()).toEqual({
      ok: false,
      error: "checkpoint does not satisfy the witness policy: cosigned by WitnessOne",
    });
  });
});
