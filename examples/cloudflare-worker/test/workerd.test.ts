import { fileURLToPath } from "node:url";
import { createHttpFetcher, createLogClient } from "@tessellog/client";
import { parseVerifierKey } from "@tessellog/core";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { describe, expect, it } from "vitest";
import { freshKeys, ORIGIN, unwrap } from "./fixtures.js";

const bundleWorker = async (): Promise<string> => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/worker.ts", import.meta.url))],
    bundle: true,
    format: "esm",
    platform: "browser",
    conditions: ["workerd", "worker", "browser"],
    write: false,
    logLevel: "silent",
  });
  const [output] = result.outputFiles;
  if (output === undefined) {
    throw new Error("esbuild produced no output");
  }
  return output.text;
};

describe("the Worker bundle on workerd", () => {
  it(
    "bundles without Node built-ins, adds an entry and serves a verifiable checkpoint",
    async () => {
      const { signerKey, verifierKey } = freshKeys();
      const mf = new Miniflare({
        modules: true,
        script: await bundleWorker(),
        compatibilityDate: "2026-11-01",
        durableObjects: { LOG: "LogDurableObject" },
        r2Buckets: ["LOG_BUCKET"],
        d1Databases: ["LOG_DB"],
        bindings: { LOG_PRIVATE_KEY: signerKey, LOG_CHECKPOINT_INTERVAL_MS: "50" },
      });
      try {
        const added = await mf.dispatchFetch("https://log.example/add", { method: "POST", body: "hello workerd" });
        expect(await added.text()).toBe("0\n");
        const client = createLogClient({
          fetcher: createHttpFetcher({
            baseUrl: "https://log.example/",
            fetch: async (input) => {
              const response = await mf.dispatchFetch(String(input));
              return new Response(await response.arrayBuffer(), { status: response.status });
            },
          }),
          origin: ORIGIN,
          logVerifier: unwrap(parseVerifierKey(verifierKey)),
        });
        const { checkpoint } = unwrap(await client.latestCheckpoint());
        expect(checkpoint.size).toBe(1n);
        expect(
          await client.proveInclusion({ entry: new TextEncoder().encode("hello workerd"), index: 0n, checkpoint }),
        ).toEqual({ ok: true, value: undefined });
      } finally {
        await mf.dispose();
      }
    },
    30_000,
  );
});
