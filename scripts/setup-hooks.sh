#!/usr/bin/env bash
# Da eseguire una volta in ogni clone da cui si pubblica su GitHub, e di nuovo dopo ogni
# aggiornamento delle guardie. Copia hook e guardie in <git-dir>/cleverops-guards/ e imposta
# core.hooksPath con un percorso ASSOLUTO: così gli hook restano attivi su qualunque branch,
# anche orphan o con una storia che non contiene .githooks/ e scripts/.
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

guards="$(cd "$(git rev-parse --git-common-dir)" && pwd)/cleverops-guards"
rm -rf "$guards"
mkdir -p "$guards/hooks"
cp .githooks/pre-commit .githooks/pre-push "$guards/hooks/"
cp scripts/check-public.mjs scripts/check-provenance.mjs scripts/public-assets.json .gitleaks.toml "$guards/"
chmod +x "$guards/hooks/"*
git config core.hooksPath "$guards/hooks"
git config cleverops.seed "$expected"
[ -f "$HOME/.config/cleverops/public-denylist.txt" ] || \
  echo "⚠ manca ~/.config/cleverops/public-denylist.txt: check-public fallirà finché non la crei" >&2
echo "✓ hook attivi da $guards (percorso assoluto), seed ${expected:0:7}"
