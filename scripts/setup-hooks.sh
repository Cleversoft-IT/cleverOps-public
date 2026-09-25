#!/usr/bin/env bash
# Da eseguire una volta in ogni clone da cui si pubblica su GitHub.
# Attiva gli hook di .githooks e registra lo SHA del commit seed per il controllo di provenienza.
# Il seed atteso è in scripts/SEED; solo al bootstrap (prima che esista) si usa --bootstrap.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
for tool in node git gitleaks; do
  command -v "$tool" >/dev/null 2>&1 || { echo "✗ manca $tool" >&2; exit 1; }
done
[ "$(git rev-parse --is-shallow-repository)" = "false" ] || { echo "✗ clone shallow: serve la storia completa" >&2; exit 1; }
roots="$(git rev-list --max-parents=0 HEAD)"
if [ "$(printf '%s\n' "$roots" | wc -l)" -ne 1 ]; then
  echo "✗ la storia locale ha più radici: questo clone non deriva dal seed pulito" >&2; exit 1
fi
expected="${SEED_SHA:-}"
[ -z "$expected" ] && [ -f scripts/SEED ] && expected="$(tr -d '[:space:]' < scripts/SEED)"
if [ -z "$expected" ]; then
  [ "${1:-}" = "--bootstrap" ] || { echo "✗ seed atteso sconosciuto (scripts/SEED o SEED_SHA)" >&2; exit 1; }
  expected="$roots"
fi
[ "$roots" = "$expected" ] || { echo "✗ la radice locale ${roots:0:7} non è il seed atteso ${expected:0:7}" >&2; exit 1; }
git config core.hooksPath .githooks
chmod +x .githooks/*
git config cleverops.seed "$expected"
[ -f "$HOME/.config/cleverops/public-denylist.txt" ] || \
  echo "⚠ manca ~/.config/cleverops/public-denylist.txt: check-public fallirà finché non la crei" >&2
echo "✓ hook attivi (core.hooksPath=.githooks), seed ${expected:0:7}"
