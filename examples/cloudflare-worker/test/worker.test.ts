import { createHttpFetcher, createLogClient, type LogFetcher } from "@tessellog/client";
import { parseVerifierKey } from "@tessellog/core";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import worker, { LogDurableObject, type Env } from "../src/worker.js";
import { freshKeys, ORIGIN, unwrap } from "./fixtures.js";

const BASE = "https://log.example/";

type Harness = {
  readonly env: Env;
  readonly verifierKey: string;
  readonly dispose: () => Promise<void>;
};

const harness = async (overrides?: Partial<Env>): Promise<Harness> => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('unused') } }",
    r2Buckets: ["LOG_BUCKET"],
    d1Databases: ["LOG_DB"],
  });
  const { signerKey, verifierKey } = freshKeys();
  const base = {
    LOG_BUCKET: await mf.getR2Bucket("LOG_BUCKET"),
    LOG_DB: await mf.getD1Database("LOG_DB"),
    LOG_PRIVATE_KEY: signerKey,
    LOG_CHECKPOINT_INTERVAL_MS: "50",
  };
  const objects = new Map<string, LogDurableObject>();
  const env: Env = {
    ...base,
    LOG: {
      idFromName: (name) => name,
      get: (id) => {
        const name = String(id);
        const object = objects.get(name) ?? new LogDurableObject(undefined, env);
        objects.set(name, object);
        return object;
      },
    },
    ...overrides,
  };
  return {
    env,
    verifierKey,
    dispose: async () => {
      await Promise.all([...objects.values()].map((object) => object.close()));
      await mf.dispose();
    },
  };
};

const fetcherThrough = (env: Env): LogFetcher =>
  createHttpFetcher({ baseUrl: BASE, fetch: async (input) => worker.fetch(new Request(input), env) });

describe("a log on a Cloudflare Worker and Durable Object", () => {
  it("adds entries and proves them with a client", async () => {
    const { env, verifierKey, dispose } = await harness();
    const texts = ["alpha", "bravo", "charlie"];
    const indices = await Promise.all(
      texts.map(async (text) => {
        const response = await worker.fetch(new Request(new URL("add", BASE), { method: "POST", body: text }), env);
        return BigInt(await response.text());
      }),
    );
    const client = createLogClient({
      fetcher: fetcherThrough(env),
      origin: ORIGIN,
      logVerifier: unwrap(parseVerifierKey(verifierKey)),
    });
    const { checkpoint } = unwrap(await client.latestCheckpoint());
    const proofs = await Promise.all(
      texts.map((text, i) =>
        client.proveInclusion({ entry: new TextEncoder().encode(text), index: indices[i] ?? -1n, checkpoint }),
      ),
    );
    expect(proofs.every(({ ok }) => ok)).toBe(true);
    await dispose();
  });

  it("refuses to start without a valid signing key, then recovers once one is set", async () => {
    const { env, dispose } = await harness({ LOG_PRIVATE_KEY: "not a key" });
    const response = await worker.fetch(new Request(new URL("checkpoint", BASE)), env);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("the log is not configured: signer key must start with PRIVATE+KEY+\n");
    await dispose();
  });

  it("retries opening the log after a failure, such as another writer holding the lease", async () => {
    const first = await harness();
    const rival = new LogDurableObject(undefined, first.env);
    await rival.fetch(new Request(new URL("checkpoint", BASE)));
    const busy = new LogDurableObject(undefined, first.env);
    const refused = await busy.fetch(new Request(new URL("checkpoint", BASE)));
    expect(refused.status).toBe(503);
    expect(await refused.text()).toBe("the log is not available, try again\n");
    await rival.close();
    const accepted = await busy.fetch(new Request(new URL("add", BASE), { method: "POST", body: "a" }));
    expect(accepted.status).toBe(200);
    await busy.close();
    await first.dispose();
  });
});
