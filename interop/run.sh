#!/usr/bin/env bash
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
work="$(mktemp -d)"
cleanup() {
  pkill -f "witness-server.ts --instance $work" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT

skey='PRIVATE+KEY+PeterNeumann+c74f20a3+AYEKFALVFGyNhPJEMzD1QIDr+Y7hfZx09iUvxdXHKDFz'
vkey='PeterNeumann+c74f20a3+ARpc2QcUPDhMQegwxbzhKqiBfsVkmqq/LDE4izWy10TW'
origin='PeterNeumann'
witness_skey='PRIVATE+KEY+WitnessOne+73f152b1+AaA1V+rFd0kL2T2VE6eN8l3w436FpdT7Gv8oGE1lCS4H'
witness_vkey='WitnessOne+3f2acfb9+BG/0vdadeZvB98cEdVaMBfkts+OT6iw8cVehe9i4nUTx'

printf '%s\n' "$skey" > "$work/log.key"
printf '%s\n' "$witness_skey" > "$work/witness.key"
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
  local log="$1" entries="$2"
  shift 2
  (cd "$here/go" &&
    go run github.com/transparency-dev/tessera/cmd/examples/posix-oneshot \
      --storage_dir "$log" --private_key "$work/log.key" --entries "$entries" "$@")
}

start_witness() {
  local name="$1"
  (cd "$here" && pnpm exec tsx witness-server.ts --instance "$work/$name" \
    --log-vkey "$vkey" --cosigner-key "$work/witness.key") > "$work/$name.out" 2>&1 &
  for _ in $(seq 1 100); do
    grep -q '^listening ' "$work/$name.out" 2>/dev/null && break
    sleep 0.1
  done
  url="$(sed -n 's/^listening //p' "$work/$name.out")"
  if [ -z "$url" ]; then
    cat "$work/$name.out" >&2
    return 1
  fi
  printf 'witness W1 %s %s\nquorum W1\n' "$witness_vkey" "$url" > "$work/$name.policy"
}

stop_witness() {
  pkill -f "witness-server.ts --instance $work/$1" 2>/dev/null || true
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

echo "== tessellog migrates in Tessera's log, appends to it, and Tessera's Go client verifies the result"
printf 'interop entry after migration\n' > "$work/after-migration"
(cd "$here" && pnpm exec tsx migrate-log.ts \
  --source-dir "$work/tessera-log" --target-dir "$work/migrated-log" \
  --vkey "$vkey" --origin "$origin" --private-key "$work/log.key" "$work/after-migration")
mkdir -p "$work/migrated-entries" && cp "$work"/first/entry-* "$work"/second/entry-* "$work/after-migration" "$work/migrated-entries/"
(cd "$here/go" && go run ./cmd/verify-log \
  --storage_dir "$work/migrated-log" --vkey "$vkey" --origin "$origin" \
  --previous_checkpoint "$work/tessera-log/checkpoint" --entries "$work/migrated-entries/*")

echo "== Tessera writes a witnessed log, tessellog's witness cosigns it and tessellog's client checks the quorum"
start_witness tessera-witness
tessera_oneshot "$work/tessera-witnessed" "$work/first/entry-*" --witness_policy_file "$work/tessera-witness.policy"
cp "$work/tessera-witnessed/checkpoint" "$work/tessera-witnessed-previous"
tessera_oneshot "$work/tessera-witnessed" "$work/second/entry-*" --witness_policy_file "$work/tessera-witness.policy"
(cd "$here" && pnpm exec tsx verify-log.ts \
  --storage-dir "$work/tessera-witnessed" --vkey "$vkey" --origin "$origin" \
  --previous-checkpoint "$work/tessera-witnessed-previous" --witness-policy "$work/tessera-witness.policy" \
  "$work"/first/entry-* "$work"/second/entry-*)
stop_witness tessera-witness

echo "== tessellog writes a witnessed log, Go's formats/note verifies the cosignature"
start_witness tessellog-witness
tessellog_oneshot "$work/tessellog-witnessed" --witness-policy "$work/tessellog-witness.policy" "$work"/first/entry-*
cp "$work/tessellog-witnessed/checkpoint" "$work/tessellog-witnessed-previous"
tessellog_oneshot "$work/tessellog-witnessed" --witness-policy "$work/tessellog-witness.policy" "$work"/second/entry-*
(cd "$here/go" && go run ./cmd/verify-log \
  --storage_dir "$work/tessellog-witnessed" --vkey "$vkey" --origin "$origin" \
  --previous_checkpoint "$work/tessellog-witnessed-previous" --entries "$work/*/entry-*" \
  --witness_vkey "$witness_vkey")
stop_witness tessellog-witness

echo "interop OK"
