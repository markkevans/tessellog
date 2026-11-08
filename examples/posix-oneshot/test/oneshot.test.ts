import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createLogClient, type LogClient } from "@tessellog/client";
import { createFileFetcher } from "@tessellog/client/node";
import { parseVerifierKey, type Checkpoint } from "@tessellog/core";
import { describe, expect, it } from "vitest";
import { oneshot } from "../src/index.js";

const SKEY = "PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz";
const VKEY = "PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW";
const CLI = fileURLToPath(new URL("../bin/posix-oneshot.ts", import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const CLI_TIMEOUT_MS = 30_000;

const run = promisify(execFile);

type Workspace = { readonly dir: string; readonly logDir: string; readonly keyFile: string };

const withWorkspace = async (test: (workspace: Workspace) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(join(tmpdir(), "tessellog-oneshot-"));
  const keyFile = join(dir, "log.key");
  await writeFile(keyFile, `${SKEY}\n`);
  try {
    await test({ dir, logDir: join(dir, "log"), keyFile });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const writeEntries = (dir: string, names: readonly string[]): Promise<readonly string[]> =>
  Promise.all(
    names.map(async (name) => {
      const path = join(dir, name);
      await writeFile(path, `contents of ${name}\n`);
      return path;
    }),
  );

const clientFor = (logDir: string): LogClient => {
  const verifier = parseVerifierKey(VKEY);
  if (!verifier.ok) {
    throw new Error(verifier.error);
  }
  return createLogClient({
    fetcher: createFileFetcher({ root: logDir }),
    origin: "PeterNeumann",
    logVerifier: verifier.value,
  });
};

const latest = async (client: LogClient): Promise<Checkpoint> => {
  const opened = await client.latestCheckpoint();
  if (!opened.ok) {
    throw new Error(opened.error);
  }
  return opened.value.checkpoint;
};

describe("adding files to a POSIX log in one shot", () => {
  it("assigns each file an index in the order given and publishes a checkpoint", () =>
    withWorkspace(async ({ dir, logDir, keyFile }) => {
      const files = await writeEntries(dir, ["a.txt", "b.txt", "c.txt"]);
      const added = await oneshot({ storageDir: logDir, privateKeyFile: keyFile, files });
      expect(added).toEqual(files.map((file, i) => ({ file, index: BigInt(i) })));
      const client = clientFor(logDir);
      const checkpoint = await latest(client);
      const proven = await Promise.all(
        files.map(async (file, i) =>
          client.proveInclusion({
            entry: new TextEncoder().encode(`contents of ${file.slice(dir.length + 1)}\n`),
            index: BigInt(i),
            checkpoint,
          }),
        ),
      );
      expect(checkpoint.size).toBe(3n);
      expect(proven.every((result) => result.ok)).toBe(true);
    }));

  it("extends the same log on a second run", () =>
    withWorkspace(async ({ dir, logDir, keyFile }) => {
      await oneshot({
        storageDir: logDir,
        privateKeyFile: keyFile,
        files: await writeEntries(dir, ["a.txt", "b.txt"]),
      });
      const client = clientFor(logDir);
      const first = await latest(client);
      const added = await oneshot({
        storageDir: logDir,
        privateKeyFile: keyFile,
        files: await writeEntries(dir, ["c.txt"]),
      });
      const second = await latest(client);
      expect(added.map(({ index }) => index)).toEqual([2n]);
      expect((await client.checkConsistency(first, second)).ok).toBe(true);
    }));

  it("refuses a private key it cannot parse", () =>
    withWorkspace(async ({ dir, logDir }) => {
      const badKey = join(dir, "bad.key");
      await writeFile(badKey, "not a key\n");
      await expect(
        oneshot({ storageDir: logDir, privateKeyFile: badKey, files: [] }),
      ).rejects.toThrow(/invalid private key/);
    }));
});

describe("running posix-oneshot from the command line", () => {
  it(
    "prints the index of each file",
    () =>
      withWorkspace(async ({ dir, logDir, keyFile }) => {
        const files = await writeEntries(dir, ["a.txt", "b.txt"]);
        const { stdout } = await run("pnpm", [
          "exec",
          "tsx",
          CLI,
          "--storage-dir",
          logDir,
          "--private-key",
          keyFile,
          ...files,
        ], { cwd: PACKAGE_DIR });
        expect(stdout).toBe(`${files[0]}: 0\n${files[1]}: 1\n`);
      }),
    CLI_TIMEOUT_MS,
  );

  it(
    "exits with usage when required options are missing",
    async () => {
      const failure = await run("pnpm", ["exec", "tsx", CLI, "a.txt"], { cwd: PACKAGE_DIR }).catch(
        (error: { readonly code: number; readonly stderr: string }) => error,
      );
      expect(failure).toMatchObject({ code: 2 });
      expect("stderr" in failure && failure.stderr).toContain(
        "usage: posix-oneshot --storage-dir DIR --private-key FILE FILE...",
      );
    },
    CLI_TIMEOUT_MS,
  );
});
