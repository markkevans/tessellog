import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withSnippets } from "./snippets.js";

const repo = fileURLToPath(new URL("..", import.meta.url));
const snippets = join(repo, "docs", "snippets");
const read = (path: string): string => readFileSync(join(snippets, path), "utf8");

const documents = [
  join(repo, "README.md"),
  join(repo, "docs", "README.md"), join(repo, "docs", "index.md"),
  ...readdirSync(join(repo, "docs", "guides")).map((name) => join(repo, "docs", "guides", name)),
  ...readdirSync(join(repo, "packages")).map((name) => join(repo, "packages", name, "README.md")),
].filter((file) => file.endsWith(".md"));

documents.forEach((file) => {
  const before = (() => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return undefined;
    }
  })();
  if (before === undefined) {
    return;
  }
  const after = withSnippets(before, read);
  if (after !== before) {
    writeFileSync(file, after);
    console.log(`synced ${file}`);
  }
});
