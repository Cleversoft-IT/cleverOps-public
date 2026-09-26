# Changelog

All notable changes to this skill set are documented here.

The format follows Drupal's stable line: tag `vX.Y.Z` means the baseline tracks Drupal `X.Y.Z`. Skill updates that do not change the Drupal baseline get patch-level bumps.

## [v11.4.0] — 2026-09-26

Suite imported into `Cleversoft-IT/cleverOps-public` (`skills/drupal11-*`), baseline moved to Drupal stable line **11.4.x** (11.4.0 released 2026-07-01).

### Added

- **`drupal11-migrate`** — seventh skill: Migrate API on D11 (migration plugins vs `migrate_plus` config entities, `migrate_source_csv` 3.x, `url` source for JSON/XML/HTTP, process pipelines, `#[MigrateSource]` (11.2+) / `#[MigrateProcess]` custom plugins, Drush 13 `migrate:*` commands, debugging) and the D6/D7 → D11 path now that Migrate Drupal is deprecated (11.4) and removed in D12. References: process plugin catalog, D7 → D11 workflow.
- **`drupal11-module-development`** — `references/scaffolding-and-quality.md`: contrib-first checklist, `drush generate` without prompts (repeatable `--answer`, no JSON `--answers`, `-vvv --dry-run` to discover questions, Drush 13 generator names), `drush field:create` options, phpcs/Coder (Drupal + DrupalPractice) and a pre-commit checklist. Route attributes and `#[Bundle]` (11.4), container-parameter autowiring (11.4).

### Changed

- Every `[forward-looking 11.4+]` block reviewed against the 11.4 release: confirmed items moved into the body (`#[Autowire(param: ...)]`, OOP hooks in core themes), unconfirmed ones rewritten as "Status at 11.4" + `[forward-looking 12.x]` (recipe uninstall, MySQLi parallel queries, richer SDC validation).
- `drupal11-module-development` description: "converting annotation plugins to attributes" instead of "defining annotation plugins".
- `drupal11-devops-testing-security`: `drush deploy` order corrected to the documented sequence `updatedb` (with cache flush) → `config:import` → `cache:rebuild` → `deploy:hook` → `cache:warm` (11.2+); composer-patches 2.x; PHPUnit 11.5 on 11.4 and PHPUnit 12 on the D12 branch; `HttpKernelUiHelperTrait`; D7 migration handed off to `drupal11-migrate`.
- `drupal11-config-management` / `drupal11-frontend-theming`: `vendor/bin/dr` (`recipe:apply`, `generate-theme`, `content:export`) with the deprecated `core/scripts/drupal` shim; recipe content import is core (no `default_content` needed); Standard profile without Article/Page; `twig/html-extra` functions; Navigation and experimental Default Admin theme.
- `drupal11-performance-caching` / `drupal11-views-and-queries`: 11.4 query reductions, Brotli assets, MySQLi still experimental.

### Fixed

- Plugin autowiring: `PluginBase` provides the autowired `create()` since 11.3 (the trait lives in `Drupal\Core\DependencyInjection`, not `Drupal\Core\Plugin`); `FormBase` uses `AutowireTrait` only since 11.4.
- Hook classes in `src/Hook/` are auto-registered as autowired services: no `services.yml` entry needed.
- Stable 9 was **not** removed in D10: it ships with D11, deprecated in 11.4, removed in D12. SDC: the `sdc` module was a core experimental module merged in 10.3, obsolete in D11.
- SDC prop validation runs only with PHP assertions enabled.
- `CachedStrategy` placeholder strategy name and version (11.2).
- Inherited from v11.3.0 and fixed after cross-model review:
  - XSS: `Markup::create()` was presented as a sanitizer (devops, frontend). It only marks a string as safe; the skills now point to `#plain_text`, Twig autoescape, `processed_text` / text formats and `Xss::filter()`/`filterAdmin()`. `check_markup()` flagged as deprecated in 11.4.
  - Early rendering: `renderInIsolation()` was suggested to keep cache metadata; it does not bubble it. Now: return render arrays, or `executeInRenderContext()` and apply the popped `BubbleableMetadata`; isolation only for mail/tokens.
  - `config_exclude_modules` belongs in the settings of the environment that exports (dev) and wherever the modules are installed, not in prod `settings.php`.
  - Themes can declare module dependencies (since 8.9): `config/install` for required config with declared dependencies, `config/optional` for optional integrations.
  - Data backfill depending on imported config → `hook_deploy_NAME` (not `hook_post_update_NAME`), also in the recipe "no PHP" note.
  - Drush 12 does not support Drupal 11: removed the "Drush 12 may still be enough" exception.
  - Lazy builders can be static methods or service callables.
  - String callables to plain functions in render arrays throw `UntrustedCallbackException` (no deprecation phase on D11); `hook_permission()` does not exist since D8.
- Fixed in v11.4.0 content after review: `#[Bundle]` also assigns classes to existing configurable bundles (node types included; it cannot create missing ones); Migrate Drupal removed from the "replace with contrib" list; D7 procedure now deletes discarded generated migrations from active config and selects by ids/group instead of `--tag="Drupal 7"`; Nginx Brotli advice uses `brotli_static`/`gzip_static` instead of the non-negotiating `try_files $uri.br` line from the change record.

### Added after review

- `drupal11-devops-testing-security/references/secure-coding.md` (CSRF section revised after a second review: method + effective CSRF check + authorization, anonymous-user gaps of `form_token` and `_csrf_request_header_token`, signed time-limited links vs one-time links): output/XSS paths, CSRF outside Form API (`_csrf_token`, `_csrf_request_header_token` + `X-CSRF-Token`, `csrf_token` service, non-GET routes), uploads with the D11 file validation constraints, logging without secrets, deserialization, review checklist.
- `drupal11-module-development`: "read analogous implementations first" and test-data rules; security self-review in the pre-commit checklist.
- `drupal11-migrate`: keep the source, document the mapping, back up and rehearse before production.
- A `LICENSE` copy inside every `skills/drupal11-*/` folder (the installer copies only the skill folder).

## [v11.3.0] — 2026-04-28

First tagged release. All six skills authored via RED → GREEN → REFACTOR with subagent-baseline verification. Baseline aligned with Drupal stable line **11.3.x**.

### Added

- **`drupal11-module-development`** — `#[Hook]` OOP front-loaded (the dominant baseline failure: agents default to procedural hooks in `.module`), attribute plugins, `AutowiredInstanceTrait` since 11.3, deprecation conversion table, `TrustedCallbackInterface` rule.
- **`drupal11-views-and-queries`** — `accessCheck()` mandatory + the unpublished-doesn't-filter subtlety, `hook_views_data_alter` as `#[Hook]` OOP, `instanceof Sql` guard for view query alter, decision matrix Views/EntityQuery/Database API/Search API.
- **`drupal11-config-management`** — Decision matrix preferring the simplest tool (`config_exclude_modules` `[core]` for modules-only vs `config_split` `[contrib]`), site UUID invariant + three labeled fixes, recipe hard limits (no uninstall, no PHP, default_content dependency, apply-time validation), `config/install` vs `config/optional`.
- **`drupal11-performance-caching`** — Cache trio with render-array `#cache` as single source of truth, `#lazy_builder` allowed-keys hard rule, BigPipe HTMX (since 11.3), PHP Fibers + ~31%/~50% query reduction, early rendering as named information-disclosure vector, Redis chainedfast layout.
- **`drupal11-frontend-theming`** — SDC in core (contrib `sdc` obsolete), Classy/Stable/Stable9 removed in D10, SDC bypasses preprocess (props/slots/`replaces:` only), SMACSS validation rule, Twig debug discipline, Layout Builder vs Paragraphs vs Blocks matrix with translation caveat.
- **`drupal11-devops-testing-security`** — Five-step `drush deploy` with both `cr` calls explicit, hook_update_N vs post_update vs deploy keyed by pre/post-`cim`, PHPUnit 11 attribute-only (10 dropped in 11.3) + don't-mix-with-annotations trap, trusted host anchoring, hash_salt + config_sync_directory hardening, D7→D11 migration vs D10→D11 upgrade tooling.

### Changed

- `README.md` updated with the final per-skill description column.
- `CHANGELOG.md` graduates from `[Unreleased]` to `[v11.3.0]`.

### Notes

- Authoring methodology (TDD-for-documentation): each skill was produced by running the same three-task scenario against a subagent **without** the skill (RED), writing the minimal skill that addressed the observed gaps (GREEN), then re-running the scenario **with** the skill loaded (REFACTOR) to verify behavioral change. Commit messages document the RED gaps and the REFACTOR self-check for traceability.

## [Unreleased]

(no changes since v11.4.0)
