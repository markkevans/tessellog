import { openCheckpoint } from "@tessellog/core";
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
  SECOND_LOG_SKEY,
  SECOND_LOG_VKEY,
  signerFor,
  verifierFor,
  WITNESS_SKEY,
} from "./fixtures/keys.js";

const validOptions = (overrides?: Partial<AppenderOptions>): AppenderOptions => ({
  driver: createMemoryDriver(),
  signer: logSigner(),
  ...overrides,
});

const createFromUntypedCaller = (options: unknown): Appender =>
  createAppender(options as AppenderOptions);

describe("validating appender options", () => {
  it("requires a signer", () => {
    expect(() => createFromUntypedCaller({ driver: createMemoryDriver() })).toThrow(/signer/);
  });

  it("requires a driver", () => {
    expect(() => createFromUntypedCaller({ signer: logSigner() })).toThrow(/driver/);
  });

  it("requires the republish interval to be at least the checkpoint interval", () => {
    expect(() =>
      createAppender(validOptions({ checkpointInterval: 10_000, checkpointRepublishInterval: 9_999 })),
    ).toThrow(/republish interval/);
  });

  it.each<[string, Partial<AppenderOptions>]>([
    ["a zero checkpoint interval", { checkpointInterval: 0 }],
    ["a zero batch size", { batching: { maxSize: 0 } }],
    ["a fractional batch size", { batching: { maxSize: 1.5 } }],
    ["a negative batch age", { batching: { maxAge: -1 } }],
    ["a zero outstanding limit", { pushback: { maxOutstanding: 0 } }],
    ["an empty origin", { origin: "" }],
    ["an origin spanning lines", { origin: "a\nb" }],
  ])("rejects %s", (_, overrides) => {
    expect(() => createAppender(validOptions(overrides))).toThrow(/invalid appender options/);
  });

  it("rejects additional signers whose name differs from the log signer", () => {
    expect(() =>
      createAppender(validOptions({ additionalSigners: [signerFor(WITNESS_SKEY)] })),
    ).toThrow(/additional signer WitnessOne must be named PeterNeumann/);
  });

  it("signs checkpoints with every additional signer", async () => {
    const appender = createAppender(
      validOptions({ additionalSigners: [signerFor(SECOND_LOG_SKEY)] }),
    );
    await appender.shutdown();
    const message = await appender.reader.readCheckpoint();
    const opened =
      message &&
      (await openCheckpoint({
        message,
        origin: LOG_KEY_NAME,
        logVerifier: logVerifier(),
        otherVerifiers: [verifierFor(SECOND_LOG_VKEY)],
      }));
    expect(opened && opened.ok && opened.value.note.verifiedSignatures.length).toBe(2);
  });
});

describe("validating antispam options", () => {
  it.each<[string, Partial<AppenderOptions>]>([
    ["a zero in-memory capacity", { antispam: { inMemoryEntries: 0 } }],
    ["a zero pushback threshold", { antispam: { pushbackThreshold: 0 } }],
  ])("rejects %s", (_, overrides) => {
    expect(() => createAppender(validOptions(overrides))).toThrow(/invalid appender options/);
  });

  it("rejects a store that does not implement the AntispamStore contract", () => {
    expect(() =>
      createFromUntypedCaller({
        ...validOptions(),
        antispam: { store: { lookup: async () => undefined } },
      }),
    ).toThrow("antispam store must implement lookup, followedSize and record");
  });
});
