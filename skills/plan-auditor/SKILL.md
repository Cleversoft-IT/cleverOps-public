---
name: plan-auditor
description: Audit software implementation plans produced by coding agents before execution, and optionally audit implemented changes against an approved plan after execution. Use when the user asks to review, verify, audit, validate, improve, re-check, iterate on, or run an external check on a development plan or its implementation, especially Claude Code Markdown plans in .claude/plans or ~/.claude/plans, Codex plans, repo-local plans/ directories, PLAN.md files, roadmap/ticket implementation plans, Drupal implementation plans, "latest plan" requests, or post-implementation plan compliance checks.
---

# Plan Auditor

Review implementation plans as a senior engineering auditor. The output should be the best possible input for the main coding agent to improve its plan before writing code.

Do not implement the plan. Do not edit project files. Do not mark plan files completed. Audit only, unless the user separately asks for changes.

Most plan-auditor conversations represent one plan moving through an iterative loop:

1. A planning agent writes or updates a plan.
2. This skill audits the plan and gives actionable feedback.
3. The planning agent revises the same plan.
4. This skill re-audits the revised plan.
5. The loop repeats until the plan is acceptable for execution.

Treat that loop as the default workflow when the user asks to re-check, verify again, review the updated plan, continue the audit, or asks whether the plan is now OK.

Optionally, after a plan has been implemented, this skill can audit the actual changes against the approved plan. Treat that as a separate post-implementation audit loop, not as permission to modify code.

## Discovery

If the user provides a path, read that plan first.

For "latest plan" or unspecified plan requests, inspect known plan directories directly before any broad repo scan. Do not start with `rg --files`, because it skips hidden directories such as `.claude/` by default.

Use targeted commands such as:

```bash
for dir in \
  .claude/plans \
  "$(git rev-parse --show-toplevel 2>/dev/null)/.claude/plans" \
  ./plans \
  .codex/plans \
  "$HOME/.claude/plans" \
  "$HOME/.codex/plans"
do
  [ -d "$dir" ] && find "$dir" -maxdepth 1 -type f -name '*.md' -printf '%T@ %TY-%Tm-%Td %TH:%TM %p\n'
done
```

Handle missing directories quietly. Rank candidates by modification time, newest first. Prefer repo-local plans over global plans when the timestamps are close or when project memory says repo-local plans are the team source of truth.

Proceed without asking when there is one clear best candidate, for example:

- The user provided an explicit path.
- One plan is clearly the newest and the other candidates are older or unrelated.
- A repo-local plan matches the current workspace and the competing global plan appears unrelated.
- The current conversation already audited a specific plan, and the user asks to re-check or continue without naming a different plan.

Ask for confirmation only when the target is genuinely ambiguous, for example:

- Two or more candidates were modified close together and could both be the intended plan.
- The newest plan is global but a slightly older repo-local plan is likely the project source of truth.
- Candidate names suggest different tasks and the user did not specify which one.
- The user previously discussed one plan, but a different plausible plan has since appeared and the request does not make the intended target clear.

When asking, keep it short: list the top 2-3 candidates with path, modification time, and a 5-10 word reason, then ask which one to audit. Do not continue the audit until the user chooses.

## Conversation Lifecycle

Maintain continuity across audit rounds in the same conversation. A re-audit is not a fresh review unless the user switches plans or explicitly asks for a clean review.

At the start of every audit or re-audit round, identify the selected plan and compute a content fingerprint before judging whether it changed. Prefer SHA-256 over MD5 when available. Include file size and modification time as supporting metadata, but do not use them as the source of truth because they can be misleading.

Use a command such as:

```bash
sha256sum "$PLAN_PATH"
stat -c '%s bytes %y' "$PLAN_PATH"
```

If `sha256sum` is unavailable, use `md5sum` as a fallback and say so in the report.

Compare the fingerprint to the previous fingerprint for the same plan in the current conversation:

- If the fingerprint changed, re-read the entire plan from beginning to end before auditing. This is mandatory, even when the user says only a small section changed.
- If the fingerprint is identical and the user asks to re-check the same plan, do not re-read or re-audit the whole file. State that the plan is unchanged, cite the matching fingerprint, and restate only the still-relevant prior verdict and next action.
- If there is no previous fingerprint in this conversation, read the entire plan in full and record the fingerprint in the report.
- If the path changed, treat it as a different plan unless the user explicitly says it is a moved or renamed version of the same plan. Read it in full and start a new fingerprint chain.

For each round:

- Re-read the current plan in full whenever its fingerprint changed or has not been recorded in this conversation. Do not rely only on the previous round's memory.
- Compare the revised plan against prior findings in this conversation.
- Classify prior findings as `resolved`, `partially resolved`, `not resolved`, or `superseded`.
- Look for regressions introduced by the revision, not just whether previous comments were addressed.
- Keep the same acceptance bar across rounds. Do not approve a plan just because it improved.
- Avoid repeating old feedback verbatim when nothing changed; summarize the remaining issue and state what still needs to change.

If the plan file fingerprint is unchanged since the previous audit round, say so and do not produce a long duplicate audit. Restate only the still-blocking findings and the exact next action needed.

If the planning agent revised a different plan file or substantially changed the goal, reset the audit framing: state that this is a new or changed plan, then audit normally.

## Context Gathering

Read the plan in full. Then gather only the repo context needed to verify it:

- `AGENTS.md`, `CLAUDE.md`, or equivalent project instructions.
- README and architecture docs directly relevant to the plan.
- Package manifests, router registration, schemas, tests, and files explicitly named by the plan.
- Existing local patterns for the exact area the plan touches.
- Prior audit feedback in the current conversation when this is a re-audit.

For Drupal projects, also check only the relevant Drupal context:

- `composer.json` to identify the Drupal major version, web root, installed packages, and custom installer paths.
- `config/sync/` only for config entities, content types, fields, views, roles, or permissions touched by the plan.
- `web/modules/custom/`, `web/themes/custom/`, `web/profiles/custom/`, and `web/sites/` only where the plan names or clearly affects them.
- Module `.info.yml`, `.routing.yml`, `.permissions.yml`, `.services.yml`, `*.libraries.yml`, schema files, update hooks, event subscribers, forms, controllers, plugins, Twig templates, and tests relevant to the planned change.
- Project instructions about Drupal commands and safety rules. If the project forbids `drush eval`, treat any plan requiring it as a finding and suggest safer Drush commands, tests, or proper scripts.

Keep exploration targeted. Avoid full-codebase tours unless the plan itself is broad.

On re-audit, prefer focused checks around:

- Files, constraints, or risks that previous findings mentioned.
- Newly added plan steps or changed assumptions.
- Verification commands or acceptance criteria that were added to satisfy previous feedback.
- Any area where the plan claims a blocker was resolved.

## Post-Implementation Audit

Use this mode only when the user asks to audit, verify, review, or check the implementation after a plan has been executed. The goal is to answer: "Did the implemented changes faithfully and safely execute the approved plan?"

This mode can also be multi-turn:

1. Read the approved plan and record its fingerprint.
2. Inspect the implementation diff and relevant changed files.
3. Report deviations, missed requirements, regressions, and missing verification.
4. The coding agent fixes the implementation.
5. Re-audit the changed implementation until the result is acceptable.

Do not turn this into a broad code review unless the user asks for one. Stay anchored to the plan, acceptance criteria, prior audit findings, and implementation risk.

### Implementation Change Discovery

Identify the change set before reading changed files in depth:

```bash
git status --short
git diff --stat
git diff --name-only
git diff
```

If the implementation is committed, inspect the relevant commit range instead:

```bash
git show --stat --oneline --decorate HEAD
git show --name-only --format=fuller HEAD
git show HEAD
```

When the user provides a branch, PR, commit, or range, use that as the source of truth. If the implementation target is ambiguous, ask before auditing.

Respect dirty worktrees. Never revert, clean, stage, commit, or edit files during this audit unless the user separately asks for changes.

### Implementation Fingerprints

For post-implementation re-audits, track both the plan fingerprint and an implementation fingerprint.

Prefer a fingerprint derived from the diff being audited, not just file mtimes. For uncommitted work, use:

```bash
git diff --binary | sha256sum
git diff --cached --binary | sha256sum
git status --short
```

For committed work, fingerprint the exact commit or range:

```bash
git rev-parse HEAD
git diff --binary BASE..HEAD | sha256sum
```

If the implementation fingerprint changed since the previous post-implementation audit, re-read the relevant diff and changed files before judging. If it is unchanged, do not repeat a full audit; cite the matching fingerprint and restate only unresolved findings.

If both staged and unstaged changes exist, report that explicitly. Audit both only when the user clearly wants the whole worktree checked; otherwise ask which change set is intended.

### Implementation Audit Criteria

Assess:

- Plan compliance: every required step, acceptance criterion, and explicit non-goal.
- Drift: code that implements a different design than the approved plan, adds unrelated scope, or omits planned safety checks.
- Integration fit: changed files follow existing architecture, naming, data flow, dependency boundaries, and error-handling patterns.
- Behavioral correctness: edge cases, state transitions, migrations, API contracts, auth, caching, async behavior, concurrency, and rollback implications.
- Test alignment: planned tests were added or run; missing tests are proportional to implementation risk.
- Verification evidence: typechecks, builds, unit/integration/e2e tests, manual UI checks, screenshots, logs, or deployment checks when relevant.
- Residual risk: anything still unsafe even if the plan was followed.
- Documentation and operations: env vars, migrations, feature flags, release notes, observability, and rollback notes when relevant.

Classify each issue as:

- `plan deviation`: implementation does not match the approved plan.
- `missed requirement`: planned behavior or verification is absent.
- `implementation defect`: code appears wrong even if the plan allowed it.
- `unplanned scope`: extra change not justified by the plan.
- `verification gap`: missing or weak evidence that the implementation works.

### Post-Implementation Verdicts

Use one of:

- `implementation accepted`: changes match the plan well enough to proceed, with only minor residual risk.
- `fix before merge`: changes are directionally right but need corrections or stronger verification.
- `stop`: the implementation is unsafe, substantially off-plan, or cannot be audited from the available evidence.

For iterative post-implementation reviews, `implementation accepted` ends the implementation audit loop. Do not require perfection; require plan compliance, no material regressions, and adequate verification for the risk.

## Audit Criteria

Assess:

- Goal clarity: user goal, non-goals, acceptance criteria.
- Repository fit: architecture, conventions, language, deployment, documented constraints.
- Scope control: coherent steps, no unrelated refactors or broad churn.
- Dependency ordering: schemas, migrations, backend contracts, frontend use, docs, tests, rollout.
- Hidden risks: data loss, auth/security, external services, concurrency, caching, async behavior, mobile/web differences, environment variables, CI/deploy.
- Verification: unit/integration tests, typechecks, builds, manual checks, screenshots/device checks for UI, rollback or observability when relevant.
- Missing context: files the coding agent should read before editing, assumptions, unanswered questions.
- Executability: whether another coding agent can execute the plan without inventing architecture.
- Iteration closure: whether all previously material findings are resolved or consciously accepted with a defensible reason.

For Drupal plans, additionally assess:

- Config/code coupling: whether config exports, schema, permissions, routes, services, libraries, cache metadata, and update hooks are ordered correctly.
- Entity and content-model safety: field storage changes, content type changes, Views, access checks, translations, file handling, and rollback/data migration risks.
- Drupal verification: appropriate use of `vendor/bin/drush cache:rebuild`, `vendor/bin/drush yaml:lint`, `vendor/bin/phpcs`, PHPUnit unit/kernel tests, config export/import checks, and manual UI checks when the plan affects forms or admin screens.

## Verdicts

Use one of:

- `go`: the plan is executable and remaining risks are minor or explicitly accepted. The main coding agent can proceed.
- `revise before execution`: the plan is directionally sound but needs material changes before coding.
- `stop`: executing the plan would likely be unsafe, wrong, or based on a missing decision.

For iterative reviews, `go` means the audit loop can stop for this plan. Do not require perfection. Require enough clarity, ordering, and verification that a competent coding agent can execute without filling in risky gaps.

Use `revise before execution` when the plan is close but still needs changes that affect implementation choices, test strategy, data safety, deployment, or user-visible behavior.

Use `stop` when the plan's goal is wrong, the target is ambiguous, required product or technical decisions are missing, or the plan conflicts with repo facts in a way that would cause harmful work.

## Report Format

Write in the user's language unless asked otherwise.

For plan audits, use this format.

Start with:

1. `Audit note:` explain that the audit is not an absolute source of truth; it is an input for improving the plan. State that the auditor may have incomplete or mistaken context, so the main coding agent should treat findings as considerations to verify against the live repo and user intent.
2. `Plan audited:` path, modification time, and one-sentence summary.
3. `Plan fingerprint:` SHA-256 hash when available, plus file size. If this is a re-audit, state whether it changed from the previous round.
4. `Audit round:` `initial` or `re-audit`, with a short note on what changed since the prior round when known.
5. `Verdict:` one of `go`, `revise before execution`, or `stop`.

Then include these sections:

- `Critical blockers`: issues that make execution unsafe or likely wrong.
- `Material improvements`: changes that materially improve the plan.
- `Missing verification`: tests/checks the plan needs.
- `Prior findings status`: for re-audits only; concise status of previous material findings.
- `Context the coding agent should read`: concrete file paths and why.
- `Suggested revised instructions for the main coding agent`: a concise prompt-ready block the user can paste into the main coding agent.

Prefer fewer, sharper findings over generic checklists. Ground critiques in file paths and observed repo facts. Distinguish facts from assumptions.

For re-audits, bias the report toward delta:

- Lead with what still prevents `go`.
- Mark resolved findings briefly instead of re-explaining them.
- Add new findings only when the revised plan created or exposed a real issue.
- If the verdict is `go`, keep the final prompt-ready block short and execution-oriented.

If no plan files are found, report the searched locations and ask the user for a path.

## Post-Implementation Report Format

For post-implementation audits, write in the user's language unless asked otherwise.

Start with:

1. `Audit note:` explain that this is an implementation audit against the plan, not an absolute guarantee of correctness.
2. `Plan audited:` path, modification time, summary, and fingerprint.
3. `Implementation audited:` worktree, branch, commit, PR, or range; include implementation fingerprint when available.
4. `Audit round:` `initial implementation audit` or `implementation re-audit`, with a short note on what changed since the prior implementation audit when known.
5. `Verdict:` one of `implementation accepted`, `fix before merge`, or `stop`.

Then include these sections:

- `Plan compliance`: what matches the approved plan and what does not.
- `Blocking issues`: plan deviations, missed requirements, defects, or unplanned scope that must be fixed.
- `Verification gaps`: tests/checks/evidence still needed.
- `Prior implementation findings status`: for implementation re-audits only.
- `Context reviewed`: concrete paths, diffs, commits, or commands used.
- `Suggested instructions for the coding agent`: concise prompt-ready fixes, scoped to implementation changes.

Keep implementation audit reports delta-oriented on re-audit. Lead with unresolved blockers, avoid restating fixed issues in detail, and call out unchanged implementation fingerprints when applicable.
