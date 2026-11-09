import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppender, createMemoryDriver, type Appender } from "@tessellog/appender";
import { createLogClient } from "@tessellog/client";
import {
  cosignatureVerifierKeyFrom,
  generateNoteKey,
  parseCosignerKey,
  parsePolicy,
  parseSignerKey,
  parseVerifierKey,
  type NoteKeyPair,
  type Result,
} from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { startWitnessServer, type WitnessServer, type WitnessServerOptions } from "../src/index.js";

const LOG_ORIGIN = "example.com/witnessed-log";
const WITNESS_NAME = "example.com/witness";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

type Fixture = {
  readonly logKeys: NoteKeyPair;
  readonly witnessKeys: NoteKeyPair;
  readonly options: WitnessServerOptions;
};

const fixture = async (): Promise<Fixture> => {
  const logKeys = unwrap(generateNoteKey({ name: LOG_ORIGIN }));
  const witnessKeys = unwrap(generateNoteKey({ name: WITNESS_NAME }));
  return {
    logKeys,
    witnessKeys,
    options: {
      storageDir: await mkdtemp(join(tmpdir(), "tessellog-witness-")),
      cosigner: unwrap(parseCosignerKey(witnessKeys.signerKey)),
      logs: [{ origin: LOG_ORIGIN, verifiers: [unwrap(parseVerifierKey(logKeys.verifierKey))] }],
      port: 0,
    },
  };
};

const policyFor = (witnessKeys: NoteKeyPair, witness: WitnessServer) =>
  unwrap(
    parsePolicy(
      `witness W1 ${unwrap(cosignatureVerifierKeyFrom(witnessKeys.verifierKey))} ${witness.url}\nquorum W1\n`,
    ),
  );

const witnessedLog = ({ logKeys, witnessKeys }: Fixture, witness: WitnessServer): Appender =>
  createAppender({
    driver: createMemoryDriver(),
    signer: unwrap(parseSignerKey(logKeys.signerKey)),
    batching: { maxSize: 1 },
    checkpointInterval: 20,
    witnessing: { policy: policyFor(witnessKeys, witness) },
  });

const addCheckpoint = (witness: WitnessServer, body: string): Promise<Response> =>
  fetch(new URL("add-checkpoint", witness.url), { method: "POST", body });

describe("a standalone witness server", () => {
  it("cosigns a log's checkpoints so that clients requiring the witness accept them", async () => {
    const setup = await fixture();
    const witness = await startWitnessServer(setup.options);
    const log = witnessedLog(setup, witness);
    const added = await Promise.all(["a", "b", "c"].map((text) => log.add(new TextEncoder().encode(text))));
    await log.awaitPublication(added.at(-1)?.index ?? -1n);
    const client = createLogClient({
      fetcher: log.reader,
      origin: LOG_ORIGIN,
      logVerifier: unwrap(parseVerifierKey(setup.logKeys.verifierKey)),
      witnessPolicy: policyFor(setup.witnessKeys, witness),
    });
    expect(unwrap(await client.latestCheckpoint()).checkpoint.size).toBe(3n);
    await log.shutdown();
    await witness.close();
    await rm(setup.options.storageDir, { recursive: true, force: true });
  });

  it("remembers the latest checkpoint of each log across restarts", async () => {
    const setup = await fixture();
    const first = await startWitnessServer(setup.options);
    const log = witnessedLog(setup, first);
    const { index } = await log.add(new TextEncoder().encode("a"));
    const checkpoint = new TextDecoder().decode(await log.awaitPublication(index));
    await log.shutdown();
    await first.close();
    const restarted = await startWitnessServer(setup.options);
    const replayed = await addCheckpoint(restarted, `old 0\n\n${checkpoint}`);
    expect(replayed.status).toBe(409);
    expect(await replayed.text()).toBe("1\n");
    await restarted.close();
    await rm(setup.options.storageDir, { recursive: true, force: true });
  });

  it("refuses to share its state directory with a running witness", async () => {
    const setup = await fixture();
    const running = await startWitnessServer(setup.options);
    await expect(startWitnessServer(setup.options)).rejects.toThrow(/cannot lock witness directory/);
    await running.close();
    await rm(setup.options.storageDir, { recursive: true, force: true });
  });

  it("answers 404 off the add-checkpoint path", async () => {
    const setup = await fixture();
    const witness = await startWitnessServer(setup.options);
    expect((await fetch(new URL("elsewhere", witness.url))).status).toBe(404);
    await witness.close();
    await rm(setup.options.storageDir, { recursive: true, force: true });
  });
});
