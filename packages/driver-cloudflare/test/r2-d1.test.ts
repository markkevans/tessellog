import { describeCoordinator, describeObjectStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { createD1Coordinator, createR2ObjectStore } from "../src/index.js";
import { freshCloudflare } from "./fixtures/miniflare.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describeObjectStore("the R2 object store on Miniflare", async () => {
  const { bucket, dispose } = await freshCloudflare();
  return { subject: createR2ObjectStore({ bucket }), cleanup: dispose };
});

describeCoordinator("the D1 coordinator on Miniflare", async () => {
  const { bucket, db, dispose } = await freshCloudflare();
  return {
    subject: await createD1Coordinator({ db, payloads: createR2ObjectStore({ bucket }) }),
    cleanup: dispose,
  };
});

describe("sharing D1 coordination state", () => {
  it("lets a second coordinator on the same database continue where the first stopped", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    const payloads = createR2ObjectStore({ bucket });
    const first = await createD1Coordinator({ db, payloads });
    await first.sequence([bytes("a"), bytes("b")]);
    await first.advanceTreeState(0n, { size: 2n, rootHash: new Uint8Array(32).fill(4) });
    const second = await createD1Coordinator({ db, payloads });
    expect(await second.sequence([bytes("c")])).toBe(2n);
    expect(await second.readSequenced(0n)).toEqual([bytes("a"), bytes("b"), bytes("c")]);
    expect(await second.readTreeState()).toEqual({ size: 2n, rootHash: new Uint8Array(32).fill(4) });
    await dispose();
  });
});

describe("refusing damaged D1 sequencing state", () => {
  it("fails when a batch's stored entries are missing", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    const payloads = createR2ObjectStore({ bucket });
    const coordinator = await createD1Coordinator({ db, payloads: { ...payloads, get: async () => undefined } });
    await coordinator.sequence([bytes("a")]);
    await expect(coordinator.readSequenced(0n)).rejects.toThrow(/missing sequenced batch/);
    await dispose();
  });

  it("fails rather than restarting from zero when the state row is damaged", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    const coordinator = await createD1Coordinator({ db, payloads: createR2ObjectStore({ bucket }) });
    await db.prepare("UPDATE tessellog_state SET root = 'damaged'").run();
    await expect(coordinator.readTreeState()).rejects.toThrow();
    await dispose();
  });
});
