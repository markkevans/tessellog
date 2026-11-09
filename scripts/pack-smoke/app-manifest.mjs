import { readdirSync } from "node:fs";
import { join } from "node:path";

const tarballs = process.argv[2];
const packages = Object.fromEntries(
  readdirSync(tarballs).map((file) => {
    const name = file.replace(/^tessellog-/, "@tessellog/").replace(/-\d+\.\d+\.\d+.*\.tgz$/, "");
    return [name, `file:${join(tarballs, file)}`];
  }),
);

process.stdout.write(
  JSON.stringify(
    { name: "tessellog-pack-smoke", private: true, type: "module", dependencies: packages, overrides: packages },
    null,
    2,
  ),
);
