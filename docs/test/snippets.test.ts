import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { embeddedSnippets } from "../snippets.js";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const snippets = join(repo, "docs", "snippets");

const markdownFiles = async (): Promise<readonly string[]> => {
  const guides = (await readdir(join(repo, "docs", "guides"))).map((name) => join(repo, "docs", "guides", name));
  const packages = await readdir(join(repo, "packages"));
  const readmes = packages.map((name) => join(repo, "packages", name, "README.md"));
  return [join(repo, "README.md"), join(repo, "docs", "README.md"), ...guides, ...readmes].filter((file) =>
    file.endsWith(".md"),
  );
};

const documents = await Promise.all(
  (await markdownFiles()).map(async (file) => ({ file, text: await readFile(file, "utf8").catch(() => "") })),
);

const embedded = documents.flatMap(({ file, text }) =>
  embeddedSnippets(text).map((snippet) => ({ ...snippet, document: relative(repo, file) })),
);

describe("documentation snippets", () => {
  it("embeds at least one snippet", () => {
    expect(embedded.length).toBeGreaterThan(0);
  });

  it.each(embedded.map((snippet) => [`${snippet.document} → ${snippet.path}`, snippet] as const))(
    "keeps %s in sync with its source file (run pnpm --filter @tessellog/docs sync)",
    async (_, { path, code }) => {
      expect(code).toBe((await readFile(join(snippets, path), "utf8")).trimEnd());
    },
  );

  it("embeds every snippet file somewhere", async () => {
    const files = (await readdir(snippets, { recursive: true })).filter((name) => name.endsWith(".ts"));
    const used = new Set(embedded.map(({ path }) => path));
    expect(files.filter((file) => !used.has(file))).toEqual([]);
  });
});
