#!/usr/bin/env bash
# Usage: scripts/sync-chrono.sh <tag>   e.g. scripts/sync-chrono.sh v2.2.0
set -euo pipefail

TAG="${1:?usage: $0 <tag>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/chrono-sync.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$TAG" https://github.com/Parihsz/Chrono.git "$TMP/Chrono"

rm -rf "$ROOT/src/Chrono"
cp -R "$TMP/Chrono/src" "$ROOT/src/Chrono"
cp "$TMP/Chrono/LICENSE" "$ROOT/LICENSE-chrono"

echo "Synced Chrono $TAG into src/Chrono ($(git -C "$TMP/Chrono" rev-parse HEAD))"
