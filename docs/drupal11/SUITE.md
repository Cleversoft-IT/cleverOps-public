# Drupal 11 Skills for Claude Code & Codex

Seven modular skills for Drupal 11 development, aligned with the stable line **11.4.x** (PHP 8.3+/8.4, Composer ≥2.7, Drush 13, PHPUnit 11.5, Symfony 7.4).

Each skill is a focused reference covering a single concern, so the agent loads only what it needs. Cross-skill handoffs are documented inside each `SKILL.md`.

## Skills

| # | Skill | Use when |
|---|---|---|
| 1 | [`drupal11-module-development`](../../skills/drupal11-module-development/SKILL.md) | Writing custom modules: services with constructor DI, `#[Hook]` OOP hooks (since 11.1), attribute plugins with autowired `create()` (since 11.3), `#[Route]` and `#[Bundle]` attributes (since 11.4), controllers, forms, entity types, `TrustedCallbackInterface`, deprecated-API replacements; scaffolding with `drush generate` / `field:create`, phpcs |
| 2 | [`drupal11-views-and-queries`](../../skills/drupal11-views-and-queries/SKILL.md) | EntityQuery (with mandatory `accessCheck()`), Views plugins via PHP attributes, `#[Hook('views_data_alter')]`, `node_access` tagging, decision between Views, EntityQuery, raw Database API and Search API |
| 3 | [`drupal11-config-management`](../../skills/drupal11-config-management/SKILL.md) | CMI (`cex`/`cim`), site UUID guard, recipes (with hard limits), `config_exclude_modules` vs `config_split` decision, `config/install` vs `config/optional`, schema and `strictConfigSchema`, default content export |
| 4 | [`drupal11-performance-caching`](../../skills/drupal11-performance-caching/SKILL.md) | Cache trio (tags/contexts/max-age) with render-array as single source of truth, `#lazy_builder`, BigPipe HTMX (since 11.3), 11.4 query reductions and Brotli, early-rendering pitfall, Redis bin layout |
| 5 | [`drupal11-frontend-theming`](../../skills/drupal11-frontend-theming/SKILL.md) | Twig 3, SDC components (in core since 10.3), Starterkit theme generation, libraries with SMACSS buckets, libraries-override / libraries-extend, Layout Builder vs Paragraphs vs Blocks |
| 6 | [`drupal11-devops-testing-security`](../../skills/drupal11-devops-testing-security/SKILL.md) | `drush deploy` sequence, `hook_update_N` / `hook_post_update_NAME` / `hook_deploy_NAME` distinction, PHPUnit 11 attributes (PHPUnit 10 dropped in 11.3), `settings.php` hardening, D10→D11 and D11→D12 upgrade tooling, security review |
| 7 | [`drupal11-migrate`](../../skills/drupal11-migrate/SKILL.md) | Migrate API: migration YAML, CSV/JSON/HTTP sources, process pipelines, `#[MigrateSource]` / `#[MigrateProcess]` plugins, Drush `migrate:*`, debugging, D6/D7 → D11 before Migrate Drupal leaves core in D12 |

## Scope

- **In scope:** Drupal core APIs, official Composer/Drush workflows, broadly adopted contrib conventions (explicitly tagged `[contrib]`).
- **Out of scope:** Drupal CMS, Canvas, Experience Builder, Navigation as a product. A separate skill set may cover those later.

## Install

The skills are distributed with the cleverOps installer from <https://github.com/Cleversoft-IT/cleverOps-public>:

```bash
npx github:Cleversoft-IT/cleverOps-public --target claude,codex \
  --skills drupal11-module-development,drupal11-views-and-queries,drupal11-config-management,drupal11-performance-caching,drupal11-frontend-theming,drupal11-devops-testing-security,drupal11-migrate
```

Restart Claude Code / Codex afterwards. Skills activate automatically when their `description` matches the request.

### Manual install (single source of truth for Claude Code and Codex CLI)

Clone once and symlink each skill folder:

```bash
# Clone canonical copy
git clone https://github.com/Cleversoft-IT/cleverOps-public.git ~/src/cleverOps-public

# Expose to Codex (user scope)
mkdir -p ~/.agents/skills
ln -s ~/src/cleverOps-public/skills/drupal11-module-development ~/.agents/skills/drupal11-module-development
# ... repeat for each drupal11-* skill

# Expose to Claude Code (relative symlink to ~/.agents/skills/)
mkdir -p ~/.claude/skills
ln -s ../../.agents/skills/drupal11-module-development ~/.claude/skills/drupal11-module-development
# ... repeat for each drupal11-* skill
```

For a single project, copy or symlink the same folders into `<project>/.claude/skills/` (Claude Code) and `<project>/.agents/skills/` (Codex).

## Versioning

Releases follow the Drupal stable line: `v11.4.x` means baseline aligned with Drupal 11.4. See [`CHANGELOG.md`](CHANGELOG.md) for what changed at each Drupal minor.

Forward-looking content (anything tagged `[forward-looking …]` inside a skill) is informational only — do not rely on it as a coding baseline until the corresponding Drupal release ships.

## Tags used inside skills

- `[core]` — Drupal core API or behavior
- `[drush]` — Drush command or workflow
- `[contrib]` — community module or convention, not part of core
- `[since 11.x]` — applies starting from that Drupal minor
- `[forward-looking 12.x]` — anticipated, verify before adopting
- `[fatto]` — verifiable from official Drupal/Drush sources
- `[regola]` — practical recommendation by these skills
- `[trade-off]` — opinionated choice with known compromises

## License

MIT — see [`LICENSE`](LICENSE). Copyright (c) 2026 Stefano (cleversoft.it).
