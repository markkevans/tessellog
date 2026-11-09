import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { parseCosignerVerifierKey, parseSignerKey, parseVerifierKey, type Result } from "@tessellog/core";
import { oneshot } from "@tessellog/example-posix-oneshot";
import { describe, expect, it } from "vitest";
import { writeKeyFiles } from "../src/index.js";

const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const withDir = async (test: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "tessellog-keygen-"));
  try {
    await test(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe("generating key files", () => {
  it("writes a private key only its owner can read, and a matching public key", () =>
    withDir(async (dir) => {
      const keys = await writeKeyFiles({ name: "example.com/log", out: join(dir, "log") });
      expect((await stat(join(dir, "log.key"))).mode & 0o777).toBe(0o600);
      const signer = unwrap(parseSignerKey((await readFile(join(dir, "log.key"), "utf8")).trim()));
      const verifier = unwrap(parseVerifierKey((await readFile(join(dir, "log.pub"), "utf8")).trim()));
      expect([signer.name, signer.keyId]).toEqual([verifier.name, verifier.keyId]);
      expect(keys.verifierKey).toBe((await readFile(join(dir, "log.pub"), "utf8")).trim());
    }));

  it("reports the cosignature verifier key a witness is listed by in policies", () =>
    withDir(async (dir) => {
      const keys = await writeKeyFiles({ name: "example.com/witness", out: join(dir, "witness") });
      const cosigner = unwrap(parseCosignerVerifierKey(keys.cosignatureVerifierKey));
      expect(cosigner.name).toBe("example.com/witness");
    }));

  it("never overwrites an existing key", () =>
    withDir(async (dir) => {
      await writeFile(join(dir, "log.key"), "precious\n");
      await expect(writeKeyFiles({ name: "example.com/log", out: join(dir, "log") })).rejects.toThrow(/EEXIST/);
      expect(await readFile(join(dir, "log.key"), "utf8")).toBe("precious\n");
    }));

  it("refuses a name that cannot be a key name", () =>
    withDir(async (dir) => {
      await expect(writeKeyFiles({ name: "has space", out: join(dir, "log") })).rejects.toThrow(
        'invalid key name "has space"',
      );
    }));

  it("produces keys that run a log end to end", () =>
    withDir(async (dir) => {
      const keys = await writeKeyFiles({ name: "example.com/log", out: join(dir, "log") });
      const entry = join(dir, "entry.txt");
      await writeFile(entry, "hello");
      await oneshot({ storageDir: join(dir, "storage"), privateKeyFile: join(dir, "log.key"), files: [entry] });
      const client = createLogClient({
        fetcher: createFileFetcher({ root: join(dir, "storage") }),
        origin: "example.com/log",
        logVerifier: unwrap(parseVerifierKey(keys.verifierKey)),
      });
      expect(unwrap(await client.latestCheckpoint()).checkpoint.size).toBe(1n);
    }));
});
