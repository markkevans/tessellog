import { leafHash, rootHash } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { clientFor } from "./fixtures/client.js";
import { verifierFor, WITNESS_VKEY } from "./fixtures/keys.js";
import { entriesFor, servedLog } from "./fixtures/served-log.js";

describe("opening the latest checkpoint", () => {
  it("returns the verified checkpoint", async () => {
    const entries = entriesFor(5);
    const { files } = await servedLog(entries);
    const opened = await clientFor(files).latestCheckpoint();
    expect(opened.ok && opened.value.checkpoint.size).toBe(5n);
    expect(opened.ok && opened.value.checkpoint.rootHash).toEqual(
      rootHash(entries.map(leafHash)),
    );
  });

  it("fails when the log has published no checkpoint", async () => {
    expect(await clientFor(new Map()).latestCheckpoint()).toEqual({
      ok: false,
      error: "log has no published checkpoint",
    });
  });

  it("fails when the checkpoint is for a different log", async () => {
    const { files } = await servedLog(entriesFor(1));
    const opened = await clientFor(files, { origin: "elsewhere.org/log" }).latestCheckpoint();
    expect(opened.ok).toBe(false);
  });

  it("fails when the log key did not sign the checkpoint", async () => {
    const { files } = await servedLog(entriesFor(1));
    const opened = await clientFor(files, {
      logVerifier: verifierFor(WITNESS_VKEY),
    }).latestCheckpoint();
    expect(opened).toEqual({ ok: false, error: "note has no verifiable signatures" });
  });
});
