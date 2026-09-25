---
name: subagent-dev-with-codex
targets: claude
description: Use when entering plan mode, planning a multi-step development or refactor task, or orchestrating subagent-driven development where GPT-5.6 (via the local Codex CLI on the ChatGPT flat plan) participates alongside Anthropic models. Triggers on plan mode, breaking work into subagents, orchestrating an implementation, or wanting a cross-model audit or second opinion.
---

# Subagent development with Codex (GPT-5.6)

## Overview

Two harnesses, one flow. The **orchestrator** — the main model of the Claude Code session — authors plans and coordinates the work; **GPT-5.6** (run through the local **Codex CLI** on the ChatGPT *flat plan*) audits those plans via its `plan-auditor` skill and works as one of the available subagent models. Anthropic and OpenAI each stay in their own harness — the only bridge is the Codex CLI. There is **no** shared model endpoint, and you never route the main model to GPT via a proxy (that abuses the flat plan and risks an account ban — the Codex CLI path is the only ToS-safe one).

Core principle: **the orchestrator authors, GPT-5.6 audits, the orchestrator decides.** The plan is written and owned by the orchestrator; Codex is the external cross-model reviewer and an implementation worker — never the plan's author.

## When to use

- You entered **plan mode** for a multi-step development, refactor, or design task.
- You're doing **subagent-driven development** and want GPT-5.6 as an available worker.
- You want a **cross-model audit or second opinion** (the two models disagree → signal to dig).

**When NOT to use:** trivial one-file edits, pure Q&A, or tasks with no planning/subagent structure. Don't drag Codex in just to add a model.

## Worker preferences — ask once, then remember

This skill does not hardcode which model implements and who reviews: that is the user's choice. The rule, keyed to an observable predicate:

- **If worker preferences are already recorded** — in the project's `CLAUDE.md` (look for a `## Subagent worker preferences` section) or stated earlier in this conversation — use them. Do not ask again.
- **Otherwise**, at the first orchestration decision (after plan approval, before dispatching any worker), ask the user with **one single `AskUserQuestion` call** containing both questions:
  1. *Default worker for implementation chunks* — offer: an Anthropic top-tier agent (opus), an Anthropic fast agent (sonnet), GPT-5.6 via Codex, or mixed per task at the orchestrator's judgment (mark this one "(Recommended)").
  2. *Code review of completed chunks* — offer: the orchestrator reviews diffs directly (mark "(Recommended)" — a dispatched same-model reviewer adds latency, not judgment), a dedicated reviewer agent, or a cross-model review via Codex.
- After the answers, **offer to persist them**: propose appending a short `## Subagent worker preferences` section to the project's `CLAUDE.md` so future sessions skip the question. Only write it if the user accepts.
- If `AskUserQuestion` is unavailable in the harness, ask the same two questions in chat.

## Why Codex calls stall (read this first)

An audit or implementation run on GPT-5.6 at high reasoning effort explores the repo itself and **routinely takes several minutes** (measured: trivial prompt ≈ 6–15 s; a real repo-exploring run 3.5–4 min; big tasks far more). Every stall mode follows from ignoring that:

1. **Foreground Bash kills the run.** Claude's Bash tool defaults to a 120 s timeout (600 s max). A foreground `codex exec` dies mid-run and you get nothing back.
2. **Codex-plugin subagents can't deliver open-ended work.** Plugin rescue agents background the job and return only a "started as task-…" stub that nobody collects, or hit the foreground timeout. Either way the orchestrator waits for a result that never arrives.
3. **`status --wait` defaults to 240 s** — longer than the default Bash timeout. Naive waiting stalls too.
4. **Known codex-plugin bugs (v1.0.x)** can leave a finished job stuck at `status=running` forever (openai/codex-plugin-cc issues #49, #264, #279). A "poll until completed" loop with no deadline never converges.

Consequences: **always run Codex in background (`run_in_background: true`), always with a hard deadline, and always collect output from a file — never from a foreground stream.**

## Calling Codex — the recipe that doesn't stall

```bash
# Bash tool with run_in_background: true
codex exec -s read-only --color never \
  -o "$SCRATCHPAD/codex-audit.md" \
  'Use $plan-auditor to audit the plan at /abs/path/to/plan.md. Context from this conversation: <decisions, constraints, goals from chat>. Write the report in the user'\''s language.'
```

- `-o <file>` writes **only the final message** — read that file when notified; stdout is polluted by hook chatter.
- `-s read-only` for audits/reviews; `-s workspace-write` for implementation tasks.
- `--skip-git-repo-check` outside a git repo.
- Follow-ups reuse the session: `codex exec resume <SESSION_ID> -o <file> "<follow-up>"`. **Audit re-rounds MUST resume** — plan-auditor's fingerprint/continuity logic assumes successive rounds happen in the same Codex conversation. `resume` accepts only a subset of flags: `-o` yes, `-s`/`--color` NOT supported (exit 2 on codex-cli 0.145.0); sandbox and model carry over. Capture the UUID from the round-1 output (`grep -m1 "session id:" <task-output-file> | grep -oE '[0-9a-f]{8}-[0-9a-f-]{27}'`); `--last` (newest session) is safe only if no other Codex run could have started in between.

## The flow

### 1. Plan mode → the orchestrator authors the plan

Explore and write the plan yourself, as normal in plan mode. Codex is not involved in authoring — authoring is never delegated.

### 2. Substantial plan → Codex audits it (`$plan-auditor`)

Audit when the plan has 3+ non-trivial steps, touches several files/modules, or involves data/migrations/auth/security/API contracts or destructive operations — high-risk domains trigger the audit **even for a single-file change**. For a small bounded low-risk change, skip the audit and present directly.

Use the recipe above (read-only). Do **not** pre-read the codebase to "prep" the auditor — Codex explores itself. Give it only the **absolute path of the plan file** plus the decisions/constraints from the conversation. Don't busy-poll while it works.

### 3. Audit loop until `go` (hard cap: 3 rounds = initial + max 2 re-audits)

Read the report. Integrate the material findings into the plan file (or consciously reject them — you own the plan), then re-audit **in the same Codex session** (`codex exec resume <SESSION_ID>`, distinct `-o` file per round). Repeat until the verdict is `go`. If there is still no `go` after 3 total rounds, stop looping and present the plan anyway, surfacing the unresolved findings to the user.

### 4. Present the vetted plan

Present via `ExitPlanMode`, citing the audit verdict (or the open findings if the cap was hit). You present a plan you've vetted and defended — not one rubber-stamped by the auditor.

### 5. Approval → the orchestrator orchestrates

Resolve worker preferences (see *Worker preferences* above — recorded ones, or one `AskUserQuestion` call). Break the approved plan into independent tasks; coordinate, synthesize, and decide per task which worker runs it.

### 6. Subagent development → GPT-5.6 is one worker among several

Dispatch per the recorded preferences. For a critical or ambiguous piece, run it on **both** a GPT-5.6 agent and an Anthropic agent and reconcile — divergence is a cheap correctness signal, and a genuinely independent second opinion requires a DIFFERENT model, not a second instance of the same one.

### 7. Optional post-implementation audit

For risky or sprawling work, once implementation is done, Codex can verify the code against the approved plan — plan-auditor has a dedicated post-implementation mode (verdicts: `implementation accepted` / `fix before merge` / `stop`). Follow-up per verdict: accepted → done; `fix before merge` → fix, then re-audit in the same session; `stop` → halt and surface to the user.

## Task routing (quick reference)

| Task shape | Prefer |
|---|---|
| Plan authoring | **The orchestrator** — never delegated |
| Plan audit (`$plan-auditor`) | GPT-5.6, background exec (read-only), loop ≤ 3 rounds |
| Post-implementation audit vs approved plan | GPT-5.6, background exec (read-only), optional |
| Implementation chunk | Per recorded worker preferences (Anthropic agent or GPT-5.6 `-s workspace-write`) |
| Code review of a chunk | Per recorded worker preferences |
| Broad read-only codebase search / mapping | Anthropic `Explore` agent |
| Orchestration, synthesis, final judgment | The orchestrator — never delegate this |
| High-stakes / ambiguous step | Both models, then reconcile |

## Bootstrap / install

Run `install.sh` in this skill directory (or verify manually). It ensures the Codex CLI is installed (`npm i -g @openai/codex`) and logged in with the ChatGPT plan (`codex login`, auth_mode `chatgpt` in `~/.codex/auth.json`). The audit flow also requires the **`plan-auditor`** skill installed in `~/.codex/skills/` — the cleverOps installer sets up both.

## Common mistakes

- **Delegating plan authoring to Codex.** Roles are fixed: the orchestrator authors, Codex audits.
- **Hardcoding a worker model instead of resolving preferences.** Check recorded preferences; ask once via `AskUserQuestion` when none exist.
- **Re-asking preferences every session.** If the project's `CLAUDE.md` records them, use them silently.
- **Any foreground Codex call for real work.** Bash timeout kills it; you get nothing. Background + file output, always.
- **Re-auditing in a fresh session instead of `codex exec resume <SESSION_ID>`.** Breaks plan-auditor's fingerprint continuity; `--last` in an orchestrated flow can resume the wrong session.
- **Audit loop without the round cap.** Plugin bugs or a stubborn auditor can keep the loop from converging; 3 rounds, then present with open findings.
- **Polling without a hard deadline.** A stuck `status` can outlive the finished work. Deadline, then read the output file anyway; canonical transcripts live in `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
- **Pre-exploring the repo to feed the auditor.** Wastes orchestrator context; Codex explores itself.
- **Pasting the audit verdict unread or auto-applying every finding.** The audit is input, not truth — verify findings against the repo, integrate or consciously reject, then present.
- **Delegating the orchestration/synthesis to a subagent.** That's the orchestrator's job — keep it.
- **Reaching for an Anthropic-base-URL proxy to make GPT the main model on the flat plan.** ToS violation / ban risk. Codex CLI only.
