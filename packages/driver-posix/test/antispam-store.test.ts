import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "@noble/hashes/sha2";
import { describeAntispamStore } from "@tessellog/driver-conformance";
import { describe, expect, it } from "vitest";
import { openPosixAntispamStore } from "../src/index.js";
import { makeTempDir, removeDir } from "./fixtures/temp-dir.js";

const identity = (text: string): Uint8Array => sha256(new TextEncoder().encode(text));

describeAntispamStore("the POSIX antispam store", async () => {
  const root = await makeTempDir();
  const store = await openPosixAntispamStore({ root });
  return { store, cleanup: () => removeDir(root) };
});

const withTempDir = async (test: (root: string) => Promise<void>): Promise<void> => {
  const root = await makeTempDir();
  try {
    await test(root);
  } finally {
    await removeDir(root);
  }
};

describe("persisting the antispam store", () => {
  it("remembers identities and progress after reopening", () =>
    withTempDir(async (root) => {
      const first = await openPosixAntispamStore({ root });
      await first.record([{ identity: identity("a"), index: 0n }], 1n);
      await first.record([{ identity: identity("b"), index: 1n }], 2n);
      const reopened = await openPosixAntispamStore({ root });
      expect(await reopened.lookup(identity("a"))).toBe(0n);
      expect(await reopened.lookup(identity("b"))).toBe(1n);
      expect(await reopened.followedSize()).toBe(2n);
    }));

  it("keeps first indices when replaying segments", () =>
    withTempDir(async (root) => {
      const first = await openPosixAntispamStore({ root });
      await first.record([{ identity: identity("a"), index: 0n }], 1n);
      await first.record([{ identity: identity("a"), index: 9n }], 10n);
      expect(await (await openPosixAntispamStore({ root })).lookup(identity("a"))).toBe(0n);
    }));

  it("refuses to open with a corrupt segment", () =>
    withTempDir(async (root) => {
      const store = await openPosixAntispamStore({ root });
      await store.record([{ identity: identity("a"), index: 0n }], 1n);
      const [segment] = await readdir(join(root, "segments"));
      await writeFile(join(root, "segments", segment ?? "missing"), Uint8Array.of(1, 2, 3));
      await expect(openPosixAntispamStore({ root })).rejects.toThrow(/corrupt antispam segment/);
    }));
});
