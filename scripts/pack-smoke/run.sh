#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

packages=(core appender client witness http static-ct driver-object-store driver-posix driver-aws driver-cloudflare driver-conformance)

pnpm --dir "$root" build
mkdir -p "$work/tarballs" "$work/app"
for package in "${packages[@]}"; do
  pnpm --dir "$root/packages/$package" pack --pack-destination "$work/tarballs" >/dev/null
done

node "$root/scripts/pack-smoke/app-manifest.mjs" "$work/tarballs" >"$work/app/package.json"
cp "$root/scripts/pack-smoke/smoke.mjs" "$root/scripts/pack-smoke/smoke-types.ts" "$root/scripts/pack-smoke/tsconfig.json" "$work/app/"
(cd "$work/app" && npm install --no-audit --no-fund --silent)
(cd "$work/app" && node smoke.mjs)
(cd "$work/app" && node "$root/node_modules/typescript/bin/tsc" -p tsconfig.json)
echo "pack smoke test passed"
