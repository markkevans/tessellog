import {
  openCheckpoint,
  parseCosignerKey,
  parseCosignerVerifierKey,
  parsePolicy,
  type NoteVerifier,
  type Policy,
} from "@tessellog/core";
import { createMemoryWitnessStore, createWitness, type Witness } from "@tessellog/witness";
import { describe, expect, it } from "vitest";
import {
  createAppender,
  createMemoryDriver,
  type Appender,
  type AppenderOptions,
} from "../src/index.js";
import {
  LOG_KEY_NAME,
  logSigner,
  logVerifier,
  WITNESS_ONE_COSIGNATURE_VKEY,
  WITNESS_ONE_COSIGNER_SKEY,
  WITNESS_TWO_COSIGNATURE_VKEY,
  WITNESS_TWO_COSIGNER_SKEY,
} from "./fixtures/keys.js";

const W1_URL = "https://w1.example/submit";
const W2_URL = "https://w2.example/submit";

const required = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const policyOf = (text: string): Policy => required(parsePolicy(text));

const witnessFor = (skey: string, knowsLog = true): Witness =>
  createWitness({
    cosigners: [required(parseCosignerKey(skey))],
    logs: knowsLog ? [{ origin: LOG_KEY_NAME, verifiers: [logVerifier()] }] : [],
    store: createMemoryWitnessStore(),
  });

const routeTo =
  (witnesses: Readonly<Record<string, Witness>>): typeof fetch =>
  async (input, init) => {
    const url = String(input);
    const witness = Object.entries(witnesses).find(([prefix]) => url.startsWith(prefix))?.[1];
    return witness === undefined ? new Response(null, { status: 404 }) : witness.handle(new Request(url, init));
  };

const witnessVerifiers = (): readonly NoteVerifier[] => [
  required(parseCosignerVerifierKey(WITNESS_ONE_COSIGNATURE_VKEY)),
  required(parseCosignerVerifierKey(WITNESS_TWO_COSIGNATURE_VKEY)),
];

const appenderWith = (overrides: Partial<AppenderOptions>): Appender =>
  createAppender({ driver: createMemoryDriver(), signer: logSigner(), batching: { maxSize: 1 }, ...overrides });

const cosignersOfPublished = async (appender: Appender): Promise<readonly string[] | undefined> => {
  const message = await appender.reader.readCheckpoint();
  if (message === undefined) {
    return undefined;
  }
  const opened = required(
    await openCheckpoint({
      message,
      origin: LOG_KEY_NAME,
      logVerifier: logVerifier(),
      otherVerifiers: witnessVerifiers(),
    }),
  );
  return opened.note.verifiedSignatures.map(({ name }) => name).filter((name) => name !== LOG_KEY_NAME);
};

const oneWitnessPolicy = () =>
  policyOf(`witness W1 ${WITNESS_ONE_COSIGNATURE_VKEY} ${W1_URL}\nquorum W1`);

const twoWitnessPolicy = () =>
  policyOf(
    `witness W1 ${WITNESS_ONE_COSIGNATURE_VKEY} ${W1_URL}\nwitness W2 ${WITNESS_TWO_COSIGNATURE_VKEY} ${W2_URL}\ngroup both all W1 W2\nquorum both`,
  );

describe("publishing witnessed checkpoints", () => {
  it("publishes a checkpoint carrying the quorum's cosignature", async () => {
    const appender = appenderWith({
      witnessing: { policy: oneWitnessPolicy(), fetch: routeTo({ [W1_URL]: witnessFor(WITNESS_ONE_COSIGNER_SKEY) }) },
    });
    await appender.add(new TextEncoder().encode("a"));
    await appender.shutdown();
    expect(await cosignersOfPublished(appender)).toEqual(["WitnessOne"]);
  });

  it("collects every witness a group quorum needs", async () => {
    const appender = appenderWith({
      witnessing: {
        policy: twoWitnessPolicy(),
        fetch: routeTo({
          [W1_URL]: witnessFor(WITNESS_ONE_COSIGNER_SKEY),
          [W2_URL]: witnessFor(WITNESS_TWO_COSIGNER_SKEY),
        }),
      },
    });
    await appender.shutdown();
    expect([...((await cosignersOfPublished(appender)) ?? [])].sort()).toEqual(["WitnessOne", "x1.example/w"]);
  });

  it("proves later checkpoints to witnesses from the size they last cosigned", async () => {
    const driver = createMemoryDriver();
    const fetchImpl = routeTo({ [W1_URL]: witnessFor(WITNESS_ONE_COSIGNER_SKEY) });
    const first = appenderWith({ driver, witnessing: { policy: oneWitnessPolicy(), fetch: fetchImpl } });
    await Promise.all(Array.from({ length: 300 }, (_, i) => first.add(new TextEncoder().encode(`e${i}`))));
    await first.shutdown();
    const second = appenderWith({ driver, witnessing: { policy: oneWitnessPolicy(), fetch: fetchImpl } });
    await second.add(new TextEncoder().encode("one more"));
    await second.shutdown();
    expect(await cosignersOfPublished(second)).toEqual(["WitnessOne"]);
  });

  it("contacts no witnesses under quorum none", async () => {
    const appender = appenderWith({
      witnessing: {
        policy: policyOf("quorum none"),
        fetch: async () => {
          throw new Error("no witness should be contacted");
        },
      },
    });
    await appender.shutdown();
    expect(await cosignersOfPublished(appender)).toEqual([]);
  });
});

describe("withholding unwitnessed checkpoints", () => {
  it("publishes nothing when the quorum is not met", async () => {
    const reported: unknown[] = [];
    const appender = appenderWith({
      witnessing: {
        policy: twoWitnessPolicy(),
        fetch: routeTo({ [W1_URL]: witnessFor(WITNESS_ONE_COSIGNER_SKEY), [W2_URL]: witnessFor(WITNESS_TWO_COSIGNER_SKEY, false) }),
      },
      onError: (error) => {
        reported.push(error);
      },
    });
    await appender.shutdown();
    expect(await appender.reader.readCheckpoint()).toBeUndefined();
    expect(String(reported.at(-1))).toContain("witness policy not satisfied");
  });

  it("publishes without the quorum when configured to fail open", async () => {
    const appender = appenderWith({
      witnessing: { policy: twoWitnessPolicy(), failOpen: true, fetch: routeTo({ [W1_URL]: witnessFor(WITNESS_ONE_COSIGNER_SKEY) }) },
    });
    await appender.shutdown();
    expect(await cosignersOfPublished(appender)).toEqual(["WitnessOne"]);
  });

  it("gives up on a witness that does not answer in time", async () => {
    const appender = appenderWith({
      witnessing: {
        policy: oneWitnessPolicy(),
        timeout: 10,
        failOpen: true,
        fetch: () => new Promise<Response>(() => undefined),
      },
    });
    await appender.shutdown();
    expect(await cosignersOfPublished(appender)).toEqual([]);
  });

  it("refuses a policy witness with no URL to submit to", () => {
    expect(() =>
      appenderWith({ witnessing: { policy: policyOf(`witness W1 ${WITNESS_ONE_COSIGNATURE_VKEY}\nquorum W1`) } }),
    ).toThrow("witness W1 has no URL to submit checkpoints to");
  });
});
