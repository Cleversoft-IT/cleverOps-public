#!/usr/bin/env bash
# Gli stessi controlli locali e CI; nessuno script d'installazione viene eseguito.
set -euo pipefail
cd "$(dirname "$0")/.."
shopt -s nullglob
files=(scripts/*.sh .githooks/* skills/*/install.sh)
for file in "${files[@]}"; do
  bash -n "$file"
done
if command -v shellcheck >/dev/null 2>&1; then
  # Errori e warning bloccanti; i suggerimenti stilistici non bloccano la CI.
  shellcheck --severity=warning "${files[@]}"
else
  echo 'AVVISO: shellcheck non disponibile; verificata la sintassi con bash -n.'
fi
python3 - <<'PY'
from pathlib import Path
import os
import subprocess
import sys
import tempfile

# Bytecode temporaneo: nessuna modifica alle risorse delle skill.
with tempfile.TemporaryDirectory(prefix="cleverops-pycompile-") as output:
    files = sorted(Path("skills").rglob("*.py"))
    if files:
        subprocess.run([sys.executable, "-m", "py_compile", *map(str, files)],
                       env={**os.environ, "PYTHONPYCACHEPREFIX": output}, check=True)
print(f"Sintassi Python verificata: {len(files)} file.")
PY
