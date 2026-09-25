#!/usr/bin/env bash
# Bootstrap for the subagent-dev-with-codex skill.
# Ensures the Codex CLI is installed and logged in with the ChatGPT (flat) plan,
# so GPT-5.6 (gpt-5.6-sol) is available as an auditor/worker alongside Anthropic models.
set -euo pipefail

echo "==> Checking Codex CLI..."
if ! command -v codex >/dev/null 2>&1; then
  echo "    Codex CLI not found. Installing @openai/codex globally..."
  npm install -g @openai/codex
else
  echo "    Found: $(codex --version)"
fi

echo "==> Checking ChatGPT (flat plan) login..."
AUTH="$HOME/.codex/auth.json"
if [ -f "$AUTH" ] && grep -q '"auth_mode"[[:space:]]*:[[:space:]]*"chatgpt"' "$AUTH"; then
  echo "    OK — logged in with ChatGPT plan (auth_mode: chatgpt)."
else
  echo "    NOT logged in with the ChatGPT plan."
  echo "    Run:  codex login   (choose 'Sign in with ChatGPT')"
  exit 1
fi

echo "==> Verifying the bridge produces output from GPT-5.6..."
if codex exec --skip-git-repo-check "Reply with one short line confirming you are operational." >/dev/null 2>&1; then
  echo "    OK — GPT-5.6 responded via Codex."
else
  echo "    WARNING — 'codex exec' did not return cleanly. Check 'codex' interactively."
  exit 1
fi

echo "==> Done. GPT-5.6 (gpt-5.6-sol) is available as an auditor/worker."
