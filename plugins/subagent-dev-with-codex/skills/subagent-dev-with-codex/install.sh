#!/usr/bin/env bash
# Bootstrap for the subagent-dev-with-codex skill.
# Ensures the Codex CLI is installed and logged in with the ChatGPT (flat) plan,
# so Codex's default model (overridable per call with `-m <slug>`, e.g. the
# model the user has chosen) is available as an auditor/worker alongside
# Anthropic models.
set -euo pipefail

CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

echo "==> Checking Codex CLI..."
if ! command -v codex >/dev/null 2>&1; then
  echo "    Codex CLI not found. Installing @openai/codex globally..."
  npm install -g @openai/codex
else
  echo "    Found: $(codex --version)"
fi

echo "==> Checking ChatGPT (flat plan) login..."
AUTH="$CODEX_HOME/auth.json"
if [ -f "$AUTH" ] && grep -q '"auth_mode"[[:space:]]*:[[:space:]]*"chatgpt"' "$AUTH"; then
  echo "    OK — logged in with ChatGPT plan (auth_mode: chatgpt)."
else
  echo "    NOT logged in with the ChatGPT plan."
  echo "    Run:  codex login   (choose 'Sign in with ChatGPT')"
  exit 1
fi

echo "==> Verifying the bridge produces output from Codex (timeout 60s)..."
# `timeout` is GNU coreutils; macOS ships without it by default (`gtimeout`
# from `brew install coreutils` provides it there). `-k 5s` guarantees a
# SIGKILL 5s after the SIGTERM if the process ignores it, so this can never
# hang forever waiting on a stuck child. If neither binary is present, skip
# the live call entirely rather than run it unbounded.
TIMEOUT_BIN=""
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN="timeout"
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN="gtimeout"
fi

if [ -z "$TIMEOUT_BIN" ]; then
  echo "    WARNING — verifica live saltata: installa coreutils (su macOS: brew install coreutils) per abilitarla."
else
  set +e
  "$TIMEOUT_BIN" -k 5s 60s codex exec --skip-git-repo-check "Reply with one short line confirming you are operational." >/dev/null 2>&1
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    echo "    OK — Codex's default model responded via Codex."
  elif [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    # 124: timeout's own "timed out" code (SIGTERM was enough).
    # 137 (128+9): the process ignored SIGTERM and needed the -k SIGKILL.
    echo "    WARNING — 'codex exec' timed out after 60s. Check 'codex' interactively."
    exit 1
  else
    echo "    WARNING — 'codex exec' did not return cleanly. Check 'codex' interactively."
    exit 1
  fi
fi

echo "==> Done. Codex's default model (override with -m <slug>) is available as an auditor/worker."
