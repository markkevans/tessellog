import { sha256 } from "@noble/hashes/sha2";
import { describeAntispamStore, describeLogDriver } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { createD1AntispamStore, openCloudflareDriver } from "../src/index.js";
import { freshCloudflare } from "./fixtures/miniflare.js";

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describeLogDriver("the Cloudflare driver on Miniflare", async () => {
  const { bucket, db, dispose } = await freshCloudflare();
  const driver = await openCloudflareDriver({ bucket, db });
  return {
    driver,
    cleanup: async () => {
      await driver.close();
      await dispose();
    },
  };
});

describeAntispamStore("the D1 antispam store on Miniflare", async () => {
  const { db, dispose } = await freshCloudflare();
  return { store: await createD1AntispamStore({ db }), cleanup: dispose };
});

describe("running a Cloudflare log across restarts", () => {
  it("continues sequencing after reopening", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    const first = await openCloudflareDriver({ bucket, db });
    await first.sequence([bytes("a"), bytes("b")]);
    await first.close();
    const second = await openCloudflareDriver({ bucket, db });
    expect(await second.sequence([bytes("c")])).toBe(2n);
    await second.close();
    await dispose();
  });

  it("lets a second antispam store instance see recorded identities and progress", async () => {
    const { db, dispose } = await freshCloudflare();
    await (await createD1AntispamStore({ db })).record([{ identity: sha256(bytes("a")), index: 4n }], 5n);
    const second = await createD1AntispamStore({ db });
    expect(await second.lookup(sha256(bytes("a")))).toBe(4n);
    expect(await second.followedSize()).toBe(5n);
    await dispose();
  });
});

describe("allowing one writer per Cloudflare log", () => {
  it("refuses a second driver while the first holds the lease", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    const first = await openCloudflareDriver({ bucket, db });
    await expect(openCloudflareDriver({ bucket, db })).rejects.toThrow(/log is held by another writer/);
    await first.close();
    await dispose();
  });

  it("allows a new driver once the first has closed", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    await (await openCloudflareDriver({ bucket, db })).close();
    await (await openCloudflareDriver({ bucket, db })).close();
    await dispose();
  });

  it("lets a new writer take over an expired lease, and the old writer then fails", async () => {
    const { bucket, db, dispose } = await freshCloudflare();
    const stale = await openCloudflareDriver({ bucket, db, leaseDuration: 1_000, clock: () => 0 });
    const takeover = await openCloudflareDriver({ bucket, db, leaseDuration: 1_000, clock: () => 5_000 });
    await expect(
      stale.writeIntegration({ size: 0n, rootHash: new Uint8Array(32), tiles: [], bundles: [] }),
    ).rejects.toThrow("lost the single-writer lease");
    await takeover.close();
    await dispose();
  });
});
