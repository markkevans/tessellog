import { describeCoordinator, describeObjectStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { createD1AntispamStore, createD1Coordinator, createR2ObjectStore } from "../src/index.js";
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

const BEYOND_DOUBLES = 2n ** 53n + 1n;

describe("keeping indices beyond 2^53 exact in D1", () => {
  const hugeLog = async () => {
    const cloudflare = await freshCloudflare();
    const coordinator = await createD1Coordinator({
      db: cloudflare.db,
      payloads: createR2ObjectStore({ bucket: cloudflare.bucket }),
    });
    await cloudflare.db
      .prepare(`UPDATE tessellog_state SET next = ${BEYOND_DOUBLES}, size = ${BEYOND_DOUBLES} WHERE id = 0`)
      .run();
    return { ...cloudflare, coordinator };
  };

  it("sequences at exact indices", async () => {
    const { coordinator, dispose } = await hugeLog();
    expect(await coordinator.sequence([bytes("a")])).toBe(BEYOND_DOUBLES);
    expect(await coordinator.sequence([bytes("b")])).toBe(BEYOND_DOUBLES + 1n);
    await dispose();
  });

  it("reads sequenced entries from an exact index", async () => {
    const { coordinator, dispose } = await hugeLog();
    await coordinator.sequence([bytes("a")]);
    await coordinator.sequence([bytes("b")]);
    expect(await coordinator.readSequenced(BEYOND_DOUBLES + 1n)).toEqual([bytes("b")]);
    await dispose();
  });

  it("forgets only the batches below an exact size", async () => {
    const { coordinator, dispose } = await hugeLog();
    await coordinator.sequence([bytes("a")]);
    await coordinator.sequence([bytes("b")]);
    await coordinator.forgetSequencedBefore(BEYOND_DOUBLES + 1n);
    expect(await coordinator.readSequenced(BEYOND_DOUBLES)).toEqual([bytes("b")]);
    await dispose();
  });

  it("advances the tree state from an exact size", async () => {
    const { coordinator, dispose } = await hugeLog();
    const next = { size: BEYOND_DOUBLES + 2n, rootHash: new Uint8Array(32).fill(7) };
    expect(await coordinator.advanceTreeState(BEYOND_DOUBLES - 1n, next)).toBe(false);
    expect(await coordinator.advanceTreeState(BEYOND_DOUBLES, next)).toBe(true);
    expect(await coordinator.readTreeState()).toEqual(next);
    await dispose();
  });

  it("records antispam indices and progress exactly", async () => {
    const { db, dispose } = await freshCloudflare();
    const store = await createD1AntispamStore({ db });
    const identity = new Uint8Array(32).fill(1);
    await store.record([{ identity, index: BEYOND_DOUBLES }], BEYOND_DOUBLES + 1n);
    expect(await store.lookup(identity)).toBe(BEYOND_DOUBLES);
    expect(await store.followedSize()).toBe(BEYOND_DOUBLES + 1n);
    await dispose();
  });
});
