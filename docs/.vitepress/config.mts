import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { defineConfig, type DefaultTheme } from "vitepress";

const REPOSITORY = "https://github.com/markkevans/tessellog";
const SCHEME_OR_ANCHOR_OR_ROOT = /^([a-z][a-z0-9+.-]*:|#|\/)/i;
const HAS_EXTENSION = /\.[a-z0-9]+$/i;

const apiSidebar: DefaultTheme.SidebarItem[] = JSON.parse(
  readFileSync(new URL("../api/typedoc-sidebar.json", import.meta.url), "utf8"),
);

const outsideTheSite = (page: string, href: string): string | undefined => {
  if (SCHEME_OR_ANCHOR_OR_ROOT.test(href)) {
    return undefined;
  }
  const [path = "", fragment] = href.split("#");
  const resolved = posix.normalize(posix.join("docs", posix.dirname(page), path));
  if (resolved.startsWith("docs/") && !resolved.startsWith("docs/snippets")) {
    return undefined;
  }
  const kind = HAS_EXTENSION.test(resolved) ? "blob" : "tree";
  return `${REPOSITORY}/${kind}/main/${resolved}${fragment === undefined ? "" : `#${fragment}`}`;
};

const guides: DefaultTheme.SidebarItem[] = [
  {
    text: "Introduction",
    items: [
      { text: "Concepts", link: "/guides/concepts" },
      { text: "Getting started", link: "/guides/getting-started" },
    ],
  },
  {
    text: "Building a log",
    items: [
      { text: "Keys and signing", link: "/guides/keys-and-signing" },
      { text: "Choosing a storage driver", link: "/guides/drivers" },
      { text: "Writing a personality", link: "/guides/personalities" },
      { text: "Antispam and deduplication", link: "/guides/antispam" },
      { text: "Static CT", link: "/guides/static-ct" },
    ],
  },
  {
    text: "Trust and operations",
    items: [
      { text: "Verifying and monitoring", link: "/guides/verifying" },
      { text: "Witnessing", link: "/guides/witnessing" },
      { text: "Operating a log", link: "/guides/operations" },
    ],
  },
];

const decisions: DefaultTheme.SidebarItem[] = [
  {
    text: "Architecture decisions",
    items: [
      ["0001-stricter-than-go-where-c2sp-is-stricter", "1. Stricter than Go where C2SP is"],
      ["0002-result-at-trust-boundaries-rangeerror-for-programmer-errors", "2. Results and RangeErrors"],
      ["0003-pure-integration-in-core-thin-drivers", "3. Pure integration, thin drivers"],
      ["0004-stateful-runtime-reassigns-never-mutates", "4. Reassign, never mutate"],
      ["0005-log-driver-contract", "5. The LogDriver contract"],
      ["0006-layered-best-effort-antispam", "6. Layered antispam"],
      ["0007-witnessing", "7. Witnessing"],
      ["0008-cloud-drivers", "8. Cloud drivers"],
      ["0009-garbage-collection-and-migration", "9. Garbage collection and migration"],
      ["0010-static-ct", "10. Static CT"],
      ["0011-integration-surface-and-packaging", "11. Integration surface and packaging"],
    ].map(([file, text]) => ({ text, link: `/adr/${file}` })),
  },
];

export default defineConfig({
  title: "tessellog",
  description: "Tamper-evident, append-only transparency logs in TypeScript. A port of Tessera.",
  base: "/tessellog/",
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: ["README.md", "snippets/**", "test/**"],
  head: [["meta", { name: "theme-color", content: "#3c6e71" }]],
  markdown: {
    config: (md) => {
      const render = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const href = token?.attrGet("href");
        const external = href === null || href === undefined ? undefined : outsideTheSite(env.relativePath, href);
        if (token !== undefined && external !== undefined) {
          token.attrSet("href", external);
        }
        return render(tokens, idx, options, env, self);
      };
    },
  },
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guides/getting-started", activeMatch: "/guides/" },
      { text: "API", link: "/api/", activeMatch: "/api/" },
      { text: "Examples", link: `${REPOSITORY}/tree/main/examples` },
      { text: "Decisions", link: "/adr/0001-stricter-than-go-where-c2sp-is-stricter", activeMatch: "/adr/" },
      { text: "npm", link: "https://www.npmjs.com/org/tessellog" },
    ],
    sidebar: {
      "/guides/": guides,
      "/adr/": decisions,
      "/api/": [{ text: "API reference", link: "/api/", items: apiSidebar }],
    },
    socialLinks: [{ icon: "github", link: REPOSITORY }],
    search: { provider: "local" },
    outline: { level: [2, 3] },
    editLink: { pattern: `${REPOSITORY}/edit/main/docs/:path`, text: "Edit this page on GitHub" },
    footer: {
      message: "Apache-2.0. A TypeScript port of Tessera; not affiliated with the transparency-dev project.",
      copyright: "Copyright 2026 Mark Evans",
    },
  },
});
