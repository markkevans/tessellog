export type EmbeddedSnippet = {
  readonly path: string;
  readonly code: string;
};

const MARKER = /<!-- snippet: (\S+) -->\n```ts\n([\s\S]*?)\n```/g;

export const embeddedSnippets = (markdown: string): readonly EmbeddedSnippet[] =>
  [...markdown.matchAll(MARKER)].map(([, path = "", code = ""]) => ({ path, code }));

export const withSnippets = (markdown: string, read: (path: string) => string): string =>
  markdown.replace(MARKER, (_, path: string) => `<!-- snippet: ${path} -->\n\`\`\`ts\n${read(path).trimEnd()}\n\`\`\``);
