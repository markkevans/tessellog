#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

skey='PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz'
vkey='PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW'
origin='PeterNeumann'

printf '%s\n' "$skey" > "$work/log.key"
mkdir -p "$work/first" "$work/second"
for i in $(seq -w 0 149); do printf 'interop entry %s\n' "$i" > "$work/first/entry-$i"; done
for i in $(seq -w 150 299); do printf 'interop entry %s\n' "$i" > "$work/second/entry-$i"; done

tessellog_oneshot() {
  local log="$1"
  shift
  (cd "$repo/examples/posix-oneshot" &&
    pnpm exec tsx bin/posix-oneshot.ts --storage-dir "$log" --private-key "$work/log.key" "$@") > /dev/null
}

tessera_oneshot() {
  (cd "$here/go" &&
    go run github.com/transparency-dev/tessera/cmd/examples/posix-oneshot \
      --storage_dir "$1" --private_key "$work/log.key" --entries "$2")
}

echo "== tessellog writes a log, Tessera's Go client verifies it"
tessellog_oneshot "$work/tessellog-log" "$work"/first/entry-*
cp "$work/tessellog-log/checkpoint" "$work/tessellog-previous"
tessellog_oneshot "$work/tessellog-log" "$work"/second/entry-*
(cd "$here/go" && go run ./cmd/verify-log \
  --storage_dir "$work/tessellog-log" --vkey "$vkey" --origin "$origin" \
  --previous_checkpoint "$work/tessellog-previous" --entries "$work/*/entry-*")

echo "== Tessera writes a log, tessellog's client verifies it"
tessera_oneshot "$work/tessera-log" "$work/first/entry-*"
cp "$work/tessera-log/checkpoint" "$work/tessera-previous"
tessera_oneshot "$work/tessera-log" "$work/second/entry-*"
(cd "$here" && pnpm exec tsx verify-log.ts \
  --storage-dir "$work/tessera-log" --vkey "$vkey" --origin "$origin" \
  --previous-checkpoint "$work/tessera-previous" "$work"/first/entry-* "$work"/second/entry-*)

echo "interop OK"
