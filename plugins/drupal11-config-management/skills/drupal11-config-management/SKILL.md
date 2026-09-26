---
name: drupal11-config-management
description: Use when working with Drupal 11 Configuration Management — drush cex/cim/cget/cset/cdel, config/sync directory, site UUID errors, config_split, config_ignore, config_readonly, recipes (drush recipe / vendor/bin/dr recipe:apply), default content and content:export, settings.php $config[...] overrides, config/install vs config/optional, *.schema.yml, strictConfigSchema test failures. Use when deciding how to differentiate config across environments (dev/staging/prod).
---

# Drupal 11 Configuration Management

## Overview

Drupal's Configuration Management Initiative (CMI) tracks site configuration in two storages: an **active storage** (the database `config` table) and a **sync storage** (YAML files in `$settings['config_sync_directory']`). The canonical workflow is dev → `drush cex` → commit → deploy → `drush updb && drush cim && drush cr`. Invariant: `cim` followed by `cex` must produce no diff.

**Recipes** `[since 11.1]` are the modern way to ship installable bundles (modules + config + content). They are not a replacement for CMI on existing sites — they are install-time composition.

## When to use

- Exporting/importing/diffing config (`drush cex`, `drush cim`, `drush cget`, `drush cset`, `drush cdel`)
- Differentiating config between environments
- Authoring or applying a recipe
- Diagnosing site UUID errors, `UnmetDependenciesException`, `enforced.module` issues
- Writing `*.schema.yml` for config entities or simple config
- Wiring `settings.php` overrides (`$config[...]`)

**When NOT to use:**
- Runtime cache of config objects (`cache.config` bin) → `drupal11-performance-caching`
- Custom config entity *type* declaration (`#[ConfigEntityType]`) → `drupal11-module-development`
- `drush deploy` ordering (`updb` → `cim` → `cr` → `deploy:hook` → `cache:warm`) → `drupal11-devops-testing-security`
- Trusted host patterns / hash salt / database settings → `drupal11-devops-testing-security`

## Decision matrix — environment differentiation

Pick the **simplest** tool that fits.

| Need | Tool | Tag |
|---|---|---|
| Scalar value differs by env (URL, mail, API endpoint) | `$config['name.of.config']['key'] = '...'` in `settings.php` | `[core]` |
| Secret value | env var (`$_ENV['FOO']`) read in `settings.php` and assigned to `$config[...]` | `[core]` |
| **Modules** enabled only in dev, no config differences | `$settings['config_exclude_modules'] = ['devel', 'stage_file_proxy'];` in the settings of every environment where those modules are installed and `cex`/`cim` run (typically dev's `settings.local.php`) | `[core]` since 8.8 |
| Modules **plus their config** differ by env | `config_split` 2.x | `[contrib]` |
| Editor owns certain config in prod (e.g. webform fields) | `config_ignore` 3.x | `[contrib]` |
| Block all config edits in prod UI | `config_readonly` | `[contrib]` |
| Per-environment content | Workspaces `[core]` or `content_sync` `[contrib]` | mixed |

**Rule of thumb.** If you only need *modules* to be off in prod and all related config can stay out of the export, `config_exclude_modules` is the right answer. Reach for `config_split` only when you also need divergent **config** (different views, different fields, different blocks) per environment.

How it works `[fatto]` (documented in `example.settings.local.php`): on **export**, excluded modules and all config depending on them are left out of `config/sync` — as if they were never installed. On **import**, excluded modules that are already installed are **not uninstalled** and their config stays intact. So the setting matters where the modules are installed: set it in **dev** (where `cex` runs with Devel enabled), and in any environment where you install them and still run `cim`. In prod, where they are not installed, it changes nothing. It only affects full sync, not single-item import/export. Never exclude modules other config depends on (field, language …): the export would not import anymore.

`config_exclude_modules` caveat: role permissions provided by an excluded module live in `user.role.*`, which is not excluded (issue 3262290): an export from dev can carry or drop them unexpectedly. Test the import on a copy of prod before relying on it.

## Workflow

```bash
# Dev — capture UI changes
drush cex -y

# Commit *.yml in $settings['config_sync_directory']
git add config/sync && git commit

# Prod — apply
drush updb -y
drush cim -y
drush cr
```

`drush deploy` wraps this with the correct order including `hook_post_update_NAME` and `hook_deploy_NAME` — see `drupal11-devops-testing-security`.

## Site UUID guard

Every Drupal install stamps `system.site:uuid`. `drush cim` aborts with *"Site UUID in source storage does not match the target storage"* when the YAML's UUID differs from the live database — protecting you from importing a *different* site's config over yours.

**Correct fixes:**

```bash
# Option A — staging is meant to clone prod, sync the DB
drush sql-sync @prod @staging
drush @staging cim -y

# Option B — install staging from existing config (matches sync UUID by design)
drush site:install --existing-config -y

# Option C — already-empty staging, just align the UUID
drush cset system.site uuid <prod-uuid> -y
drush cim -y
```

**Do NOT** edit `system.site.uuid` inside `config/sync/system.site.yml` to match the wrong env — the next environment will hit the same wall. The UUID belongs to the *site*, not the export.

## `config/install` vs `config/optional`

| Folder | Behavior | Use for |
|---|---|---|
| `MODULE/config/install/*.yml` | Loaded **always** at module enable. Every dependency MUST be satisfied or `UnmetDependenciesException`. | Required config the module cannot run without. |
| `MODULE/config/optional/*.yml` | Loaded only if dependencies are currently satisfied. Re-scanned when other modules enable later. | Config that integrates with optional partner modules. |

**Themes follow the same rule.** Since 8.9 a theme can declare module dependencies in its `*.info.yml` (`dependencies: [drupal:block_content]`, change record <https://www.drupal.org/node/2937955>); they are not enabled automatically — the module must be installed first (and required in `composer.json`). Config the theme cannot work without, whose dependencies are declared, goes in `config/install/`; config that only integrates with modules that may be absent goes in `config/optional/`.

## `settings.php` overrides

```php
// Scalar override — env-specific.
$config['system.site']['name'] = 'Staging';
$config['system.mail']['interface']['default'] = 'symfony_mailer';

// Activate / deactivate a config split per env.
$config['config_split.config_split.dev']['status'] = TRUE;

// Read from environment.
$config['my_module.settings']['api_key'] = $_ENV['MY_MODULE_API_KEY'] ?? '';
```

Overrides are runtime-only — they do not bleed into `cex`. `drush cget --include-overridden` to see effective values.

## Recipes — what they are and what they aren't

`[since 11.1]` Recipes mature significantly; `[since 11.2]` `drupal/core-recipe-unpack` plugin provides Composer dependency unpacking; `[since 11.4]` extensions are installed in batches, roughly halving recipe apply time. **Drush 13 is required** for `drush recipe`.

```
recipes/blog/
├── recipe.yml
├── composer.json          # optional, only for Packagist distribution
├── config/                # *.yml to import after the recipe runs
└── content/               # default-content YAML, by UUID
    └── node/
        ├── 11111111-...yml
        └── 22222222-...yml
```

`recipe.yml` skeleton:

```yaml
name: 'Blog'
description: 'Modules, config tweaks, two seed articles.'
type: 'Content type'

recipes:
  - core/recipes/article_content_type

install:
  - pathauto
  - metatag

config:
  import:
    pathauto: '*'         # null = all default config of the module
  actions:
    system.site:
      simpleConfigUpdate:
        slogan: 'Welcome to the blog'

content:
  - content                # path to the content/ directory above
```

Apply:

```bash
drush recipe recipes/blog
# or, without Drush [since 11.4, experimental CLI]:
vendor/bin/dr recipe:apply recipes/blog
# on 11.3 and earlier (deprecated shim in 11.4, removed in D13):
php core/scripts/drupal recipe recipes/blog
```

The path is checked against the current working directory — run from the directory the path is relative to, or pass an absolute path. Core ships reusable recipes under `core/recipes/` (`article_content_type`, `page_content_type`, `editorial_workflow`, …); `[since 11.4]` the Standard profile no longer creates Article and Page, so apply those recipes when a project expects them.

**Hard limits — keep in mind:**

- **No uninstall.** Once applied, you cannot "remove" a recipe — you must roll back manually. Recipes are forward-only.
- **No PHP execution.** A recipe is YAML + config + content. If you need imperative logic (data backfill, computed defaults), put it in a module — `hook_install()` for install-time logic, `hook_deploy_NAME` for deploy-time data that depends on imported config — and ship the module via the recipe's `install:` list.
- **Config validation is improving but limited.** Schema mismatches show up at apply time, not at lint time.
- **Content is imported by core** (`Drupal\Core\DefaultContent\Importer`, since the recipe system landed in 10.3) — no contrib module needed. Existing entities with the same UUID are skipped, not updated. `[since 11.3]` core can also export content in that format: `vendor/bin/dr content:export node 12 --with-dependencies --dir=recipes/blog/content` (11.4; on 11.3 `php core/scripts/drupal content:export …`).

## Schema

`*.schema.yml` lives in `MODULE/config/schema/`. Every config object — simple config and config entities — must be schema-typed for translation, validation, and tests.

`[since D10]` `KernelTestBase::$strictConfigSchema = TRUE` by default. `[since D11]` core executes **all** validation constraints at strict-schema test time (issue 3361534), softened to deprecation for contrib (issue 3379899). A missing or incomplete schema breaks tests under strict mode.

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| Site UUID mismatch between environments | `cim` aborts. Sync the DB, set the UUID, or use `--existing-config` install. |
| Tokens (paths, keys, mail) committed in YAML | Leaks secrets, breaks portability. Move to `$config[...]` in `settings.php`. |
| Module not declared in `.info.yml` `dependencies:` | Its config import fails with `UnmetDependenciesException`. |
| `enforced.module` overuse | Optional config refuses to install when listed modules absent. Reserve for genuine hard dependencies. |
| `drush cim --partial` | Bypasses dependency consistency. Leaves the target inconsistent — use only with full understanding. |
| `core.extension` excluded from export | Future module enables/uninstalls cannot propagate via `cim`. Always export it. |
| Missing `*.schema.yml` for new config | Tests fail under `strictConfigSchema`; UI translation falls back to raw values. |
| Theme shipping config for an **optional** module in `config/install/` | Theme install fails with `UnmetDependenciesException` when that module is absent. Declare the module in the theme's `dependencies:` if it is required, or move the config to `config/optional/`. |
| Hand-recreating a config entity instead of editing | New `uuid:` produces delete + create instead of update (issue 2876795). Edit in place. |

## Quick reference

| Operation | Command |
|---|---|
| Export active → sync | `drush cex -y` |
| Import sync → active | `drush cim -y` |
| Show single config object | `drush cget my_module.settings` |
| Set a scalar | `drush cset my_module.settings key value -y` |
| Delete a config object | `drush cdel my_module.settings` |
| Apply a recipe | `drush recipe path/to/recipe` (requires Drush 13) or `vendor/bin/dr recipe:apply path/to/recipe` (11.4+) |
| Export default content for a recipe | `vendor/bin/dr content:export <entity_type> <id> --with-dependencies --dir=<recipe>/content` |
| Install from existing config | `drush site:install --existing-config -y` |

## Cross-skill handoff

- `cache.config` bin and warming → `drupal11-performance-caching`
- `hook_deploy_NAME` for data backfill that depends on imported config (it runs after `cim`; `hook_post_update_NAME` runs before) → `drupal11-devops-testing-security`
- `#[ConfigEntityType]` declaration and config entity classes → `drupal11-module-development`
- Trusted hosts, hash salt, reverse proxy in `settings.php` → `drupal11-devops-testing-security`
- Migrations shipped as `migrate_plus.migration.*` config, reloading them with `config:import --partial` → `drupal11-migrate`

## Status at 11.4 and looking ahead

- `[fatto]` Recipes are still **forward-only in 11.4**: there is no recipe uninstall/unapply API. Keep treating a recipe as install-time composition and plan rollbacks by hand.
- Config validation keeps expanding minor by minor, but not every config type is fully validatable yet: keep checking schema errors at apply time and in Kernel tests.
- `[forward-looking 12.x]` Recipe uninstall is not announced for a specific release. Validate against change records before relying on it.
