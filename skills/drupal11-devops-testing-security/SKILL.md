---
name: drupal11-devops-testing-security
description: Use when working on Drupal 11 deployment (composer recommended-project, composer-patches, drush deploy, drush updatedb / cim / deploy:hook / cache:warm, hook_update_N vs hook_post_update_NAME vs hook_deploy_NAME), settings.php hardening (trusted_host_patterns, hash_salt, config_sync_directory), PHPUnit 11 with attributes, KernelTestBase / BrowserTestBase, Nightwatch, major-version upgrades (D10→D11, D11→D12 readiness, choosing migration vs upgrade for D7 sites), and security (SQL injection, XSS, CSRF, AccessResult, TrustedCallbackInterface, SA-CORE).
---

# Drupal 11 DevOps, Testing & Security

## Overview

Three concerns share this skill because they all live at the boundary between code and production: **deploy** (Composer + Drush), **tests** (PHPUnit 11 + Nightwatch), and **security** (SQL/XSS/CSRF + access checks + advisories).

Baseline: Drupal **11.4.x**, PHP **8.3+ (8.4 recommended)**, Composer **≥ 2.7**, **Drush 13** for upgrade/deploy/recipes, **PHPUnit 11.5** (PHPUnit 10 dropped in D11.3), Symfony 7.4.

## When to use

- Setting up `composer.json` for a Drupal site, upgrading from D10
- Writing or wiring `drush deploy`, scripting CI/CD
- Picking between `hook_update_N`, `hook_post_update_NAME`, `hook_deploy_NAME`
- Hardening `settings.php` (trusted hosts, hash salt, reverse proxy, sync dir)
- Secure coding review of custom code (XSS, CSRF, uploads, logs) → `references/secure-coding.md`
- Writing PHPUnit / Kernel / Functional / WebDriver / Nightwatch tests
- Upgrading from D10 to D11, preparing D11 → D12; deciding migration vs upgrade for D6/D7 sites
- Reviewing for SQL injection, XSS, CSRF, AccessResult, untrusted callbacks
- Tracking security advisories and release windows

**When NOT to use:**
- Application-level module code patterns → `drupal11-module-development`
- Config schema, sync workflow, recipes → `drupal11-config-management`
- Cache backends choice / Redis settings as a perf decision → `drupal11-performance-caching`
- Theme asset deployment, Twig debug toggle → `drupal11-frontend-theming`
- Writing and running migrations (D7 → D11, CSV/JSON imports) → `drupal11-migrate`

## Composer project

Modern template: **`drupal/recommended-project`** (Drupal under `web/`, scaffolding via `drupal/core-composer-scaffold`).

Key dependencies:

```json
{
  "require": {
    "drupal/core-recommended": "^11",
    "drupal/core-composer-scaffold": "^11",
    "drush/drush": "^13",
    "composer/installers": "^2.1",
    "cweagans/composer-patches": "^2"
  },
  "require-dev": {
    "drupal/core-dev": "^11",
    "drupal/devel": "^5",
    "mglaman/phpstan-drupal": "^2"
  }
}
```

Notes:
- `cweagans/composer-patches` 2.x is stable since October 2025. It resolves patches into **`patches.lock.json` (commit it)**: run `composer patches-relock` after changing patch definitions and `composer patches-repatch` to reapply them (it deletes and reinstalls the patched packages — no local edits there). Existing projects can stay on 1.7.x until they migrate.
- `[since 11.4]` `drupal/core-recommended` no longer pins Guzzle, Twig or the Symfony polyfills to exact versions: security fixes in those libraries arrive with `composer update` without waiting for a core release. `drupal/legacy-project` is abandoned — use `drupal/recommended-project`.
- For installing a contrib module that has not yet declared D11 compatibility, add `mglaman/composer-drupal-lenient` and list the package under its `extra.drupal-lenient.allowed-list`.

## Drush 13 — baseline `[drush]`

`[fatto]` **Drush 13 is required on Drupal 11**: Drush 12 supports Drupal 10 only (compatibility table at <https://www.drush.org/13.x/install/>). A D10 site still on Drush 12 must move to Drush 13 as part of the D11 upgrade.

`[since 11.4]` Core ships an **experimental** CLI, `vendor/bin/dr` (`cache:rebuild`, `recipe:apply`, `generate-theme`, `install`, `quick-start`), built with the Drush maintainers as the first step of moving Drush into core; `php core/scripts/drupal` is now a deprecated shim for it. Keep Drush for deploy pipelines. Drush 14 (for 11.3+ and 12) is not released yet at the time of writing.

## `drush deploy` — exact order `[fatto]`

```bash
drush updatedb -y          # 1. hook_update_N then hook_post_update_NAME, then flushes all caches (--cache-clear, on by default)
drush config:import -y     # 2. apply config/sync to active storage
drush cache:rebuild        # 3. container consistent with new config
drush deploy:hook -y       # 4. hook_deploy_NAME (needs new config + container)
drush cache:warm           # 5. [since 11.2, Drush ≥ 13.5] pre-warm caches
```

`drush deploy` runs exactly this sequence (step 5 only on Drupal ≥ 11.2) — source: <https://www.drush.org/13.x/deploycommand/>. The cache flush at the end of `updatedb` is what keeps `cim` from running against a stale container: **never script `updatedb --no-cache-clear` before `cim`**. The `cache:rebuild` after `cim` makes services see the imported config before `deploy:hook`.

`drush deploy` does not toggle maintenance mode — do that yourself if the release needs it.

## `hook_update_N` vs `hook_post_update_NAME` vs `hook_deploy_NAME`

Confusing these is the single most common deploy bug. Pick by **what the code needs to be true**:

| Hook | When it fires | API available | Use for |
|---|---|---|---|
| `hook_update_N` | inside `updatedb`, **before `cim`** | limited, schema-level | schema changes, low-level data fixes that must work against the *old* config |
| `hook_post_update_NAME` | inside `updatedb`, after `update_N`, still **before `cim`** | full entity API | data updates needing the entity system but not new config |
| `hook_deploy_NAME` (in `MODULE.deploy.php`) | inside `deploy:hook`, **after `cim`** and a `cr` | full | code that depends on config that has just been imported |

Classic example of `hook_deploy_NAME`: backfill a default value into a node field that was just created by config import. Doing it in `hook_post_update_NAME` would fail because the field doesn't exist yet at that point.

## `settings.php` hardening

```php
// Trusted hosts: regex anchored, dots escaped.
$settings['trusted_host_patterns'] = [
  '^example\.com$',
  '^.+\.example\.com$',
];

// Hash salt: from a secret outside the repo.
$settings['hash_salt'] = file_get_contents('/etc/drupal/myproject.salt');

// Generate a fresh salt:
//   drush php:eval 'echo \Drupal\Component\Utility\Crypt::randomBytesBase64(55);'

// Config sync directory — current name (the old $config_directories was removed in D9).
$settings['config_sync_directory'] = '/var/www/myproject/config/sync';

// Reverse proxy
$settings['reverse_proxy'] = TRUE;
$settings['reverse_proxy_addresses'] = ['10.0.0.1', '10.0.0.2'];
```

`settings.local.php` for development includes `sites/development.services.yml`, swaps render/page/dynamic_page_cache to null bins, enables verbose error reporting. **Never commit `settings.local.php` enablement to production**: gate the include behind an env check.

## Testing — pick the lowest level that suffices

| Class | Boots | Speed | Use for |
|---|---|---|---|
| `UnitTestCase` | nothing — pure PHPUnit | ms | Pure logic, no Drupal services |
| `KernelTestBase` | container + DB schema | seconds | Service interactions, entity API, config |
| `BrowserTestBase` | full install | slow | Mink, no-JS HTTP flows, forms |
| `WebDriverTestBase` / `FunctionalJavascriptTest` | full install + ChromeDriver | slowest | JS interactions, AJAX, BigPipe |

## PHPUnit 11 — D11.4 state

`[since 11.2]` PHPUnit 11 supported, attributes available.
`[since 11.3]` **PHPUnit 10 support REMOVED.** Core and contrib must run on PHPUnit 11.
`[since 11.4]` Still PHPUnit 11 (`drupal/core-dev` requires `^11.5`). PHPUnit 11 deprecates doc-comment annotations; **PHPUnit 12 removes them**, and the Drupal 12 development branch already requires PHPUnit 12 — convert now.

Annotation → attribute conversion (mandatory for new tests):

| Annotation | Attribute |
|---|---|
| `@group name` | `#[Group('name')]` |
| `@dataProvider methodName` | `#[DataProvider('methodName')]` |
| `@covers ClassName` | `#[CoversClass(ClassName::class)]` |
| `@runTestsInSeparateProcesses` | `#[RunTestsInSeparateProcesses]` |
| `@group legacy` | `#[IgnoreDeprecations]` |

**Never mix annotations and attributes in the same file.** PHPUnit silently ignores the annotations once it sees any attribute on the class — partial conversion produces tests that look complete but skip metadata you thought was active. Use `palantirnet/drupal-rector` rules to convert in bulk.

Also relevant `[since D11]`:
- `KernelTestBase::$strictConfigSchema = TRUE` by default; D11 runs all validation constraints (issue 3361534), softened to deprecation for contrib (issue 3379899).
- ChromeDriver: `chromeOptions` was removed; use **`goog:chromeOptions`**.
- `run-tests.sh` does **not** work for JS tests without a ChromeDriver running — it reports silent success. Use `phpunit` directly, or wire ChromeDriver in CI.
- `[since 11.4]` `Drupal\Tests\HttpKernelUiHelperTrait` lets a **Kernel** test call `drupalGet()`, `clickLink()` and `assertSession()` through the HTTP kernel — convert slow `BrowserTestBase` tests that only check rendered HTML.

### Canonical kernel test

```php
<?php

declare(strict_types=1);

namespace Drupal\Tests\my_module\Kernel;

use Drupal\KernelTests\KernelTestBase;
use Drupal\my_module\Greeter;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\Group;

#[CoversClass(Greeter::class)]
#[Group('my_module')]
final class GreeterTest extends KernelTestBase {

  protected static $modules = ['my_module'];

  private Greeter $greeter;

  protected function setUp(): void {
    parent::setUp();
    $this->greeter = $this->container->get('my_module.greeter');
  }

  public function testGreetReturnsFormattedGreeting(): void {
    self::assertSame('Hello, Ada!', $this->greeter->greet('Ada'));
  }
}
```

Run a single class:

```bash
export SIMPLETEST_DB="mysql://user:pass@127.0.0.1/drupal_test"
export SIMPLETEST_BASE_URL="http://localhost"
./vendor/bin/phpunit -c web/core/phpunit.xml.dist \
  web/modules/custom/my_module/tests/src/Kernel/GreeterTest.php
```

### Nightwatch and ExistingSite

- **Nightwatch** `[core] [since 8.6]`: JS-native tests in `mymodule/tests/src/Nightwatch/Tests/`. Run: `yarn test:nightwatch --tag mymodule`. Bundles axe-core for a11y.
- **ExistingSite** `[contrib]` (`weitzman/drupal-test-traits`): tests against an already-installed site, doesn't wipe the DB. Base classes `ExistingSiteBase`, `ExistingSiteWebDriverTestBase`. Useful for smoke + content-heavy regression.

## Migration vs upgrade

- **D6/D7 → D11 is a migration**, not an upgrade. **D7 EOL was 5 January 2025.** `[since 11.4]` Migrate Drupal is deprecated (Migrate Drupal UI since 11.3) and both are **removed in D12 with no contrib replacement**: D6/D7 sites must migrate to **Drupal 11** and then upgrade to D12. How to run it → `drupal11-migrate`.
- **D10 → D11 and D11 → D12 are upgrades.** Tooling:
  - `drupal/upgrade_status` — readiness scan (5.x covers 11 → 12).
  - `palantirnet/drupal-rector` — automated code transforms for deprecations.
  - PHPStan with `mglaman/phpstan-drupal` + `phpstan/phpstan-deprecation-rules` — static analysis for deprecations (`mglaman/drupal-check` still works but is pinned to PHPStan 1 and has not been released since 2024).

**Run the scan and the transforms on the old major BEFORE you bump.** After the major bump the deprecated APIs are already gone, so the tools have nothing to flag and the site fatals at runtime instead of warning at scan time. For D12 also plan the extensions removed from core that continue in contrib (Contact, History, Ban, Field Layout, Stable 9 …): require their contrib projects before the bump. Migrate Drupal and Migrate Drupal UI have **no** contrib replacement — finish D6/D7 migrations on D11 (see `drupal11-migrate`).

## Security — what to enforce

The essentials follow. For preventive coding (XSS output paths, CSRF for controllers/AJAX/REST, upload validation, logging without secrets, deserialization) and a review checklist, read `references/secure-coding.md`.

### SQL — never concatenate

```php
// ❌ Wrong: string interpolation
$rows = $this->database->query('SELECT * FROM {users_field_data} WHERE name LIKE "%' . $name . '%"');

// ✅ Right: placeholders + escapeLike()
$like = '%' . $this->database->escapeLike($name) . '%';
$rows = $this->database->select('users_field_data', 'u')
  ->fields('u', ['uid', 'name'])
  ->condition('u.name', $like, 'LIKE')
  ->execute()
  ->fetchAll();

// Or with query() if you must:
$rows = $this->database->query(
  'SELECT uid, name FROM {users_field_data} WHERE name LIKE :n',
  [':n' => $like],
)->fetchAll();
```

`db_query()` was removed — only `$this->database->query(...)` and the chainable selects/inserts/updates remain.

### XSS — escape by default, filter on purpose

Pick the output path by what the value is:

```php
// Untrusted plain text → escaped.
$build['name'] = ['#plain_text' => $user_supplied_name];

// User-authored rich text → through a text format (filters + cacheability).
$build['body'] = [
  '#type' => 'processed_text',
  '#text' => $value,
  '#format' => 'basic_html',
];

// #markup is passed through Xss::filterAdmin() (or #allowed_tags): fine for
// admin/trusted HTML, not a substitute for a text format on user input.
$build['help'] = ['#markup' => $this->t('See <a href=":url">the docs</a>.', [':url' => $url])];
```

- Twig autoescapes (`html` strategy) everything that is not a `MarkupInterface` object. **Never use `|raw` on anything derived from user input**; it is only for values already rendered or filtered upstream.
- `Xss::filter()` (restrictive tag list) / `Xss::filterAdmin()` (admin tag list) filter HTML strings when you cannot use a text format.
- `Markup::create()` **does not filter or escape**: it only marks a string as already safe. Use it solely for HTML you generated or verified yourself; wrapping user input in it disables autoescape and creates an XSS.
- `check_markup()` is deprecated in 11.4 (removed in D13): return a `processed_text` render array instead, so the format's cacheability bubbles.
- `t()` placeholders: `@` escapes, `%` escapes and wraps in `<em>`, `:` escapes and strips dangerous protocols (use it for URLs in `href`).

### CSRF

Form API includes CSRF tokens automatically. Outside Form API (controllers, links, AJAX) every state-changing route needs its own protection — full patterns in `references/secure-coding.md`. For **state-changing GET routes** (the rare cases where this is justified), require both a permission and a token:

```yaml
my_module.delete_thing:
  path: '/thing/{id}/delete'
  defaults:
    _controller: '\Drupal\my_module\Controller\ThingController::delete'
  requirements:
    _permission: 'administer my_module'
    _csrf_token: 'TRUE'
```

### Access — return AccessResult with cacheability

Every access check on entities, routes, and blocks returns `AccessResult`. Always include cacheability or the result silently caches under the wrong context.

```php
return AccessResult::allowedIf($node->isPublished() && $account->hasPermission('view article'))
  ->cachePerPermissions()
  ->addCacheableDependency($node);
```

Permissions are declared in `MODULE.permissions.yml` (static) or via a `permission_callbacks:` callback (dynamic). `hook_permission()` no longer exists since D8.

### Files

- `public://` — direct download; never put secrets here.
- `private://` — must be served via `hook_file_download()`; configure the private files path in `settings.php`.
- `temporary://` — auto-cleanup, do not rely on persistence.

`[since 10.2]` File validation uses constraint plugins (`FileExtension`, `FileExtensionSecure`, `FileSizeLimit`, `FileIsImage`, `FileImageDimensions`, `FileNameLength`, `FileEncoding`) via `#upload_validators` or the `file.validator` service; the `file_validate_*()` functions are gone in D11. Configure limits on the field. **SVG must be sanitized** (e.g. `[contrib]` `svg_sanitizer`) or refused — SVG can carry script. Upload code, CSRF outside forms, logging and deserialization: `references/secure-coding.md`.

### Trusted callbacks

Any class providing `#pre_render`, `#post_render`, `#lazy_builder`, or `#access_callback` MUST implement `TrustedCallbackInterface` and list its callbacks in `trustedCallbacks()`. **String callables to plain functions in render arrays** (e.g. `'#pre_render' => 'my_module_callback'`) throw `UntrustedCallbackException` on D11. Migrate to array callables on a class implementing the interface.

### Security advisories — release window

- **SA-CORE / SA-CONTRIB / PSA**, scored against NIST CMSS.
- **Release window: Wednesday.** Core security releases: **third Wednesday of the month**. Out-of-band releases happen for highly-critical issues.
- **Coverage:** the current minor and the previous one. LTS only for major versions.
  - **D7 EOL: 5 Jan 2025.**
  - **D10 EOL: December 2026** (fixed to that minor release window regardless of the D12 date).
  - 11.3.x security support until December 2026; 11.4.x until June 2027; D11 as a whole gets long-term support (expected through the end of 2028).
- `[contrib service]` Drupal Steward: WAF-like buffer for sites that cannot patch immediately.

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| `updatedb --no-cache-clear` (or a hand-rolled `updb` without flush) before `cim` | `cim` runs with a stale container — config import sees old service definitions, can corrupt entity update state. |
| Confusing the three update hook families | Code that needs new config in `hook_post_update_NAME` fails because cim hasn't run yet; code that should be in `hook_update_N` fails because the container isn't ready. |
| `cim` before `updb` on a fresh deploy | Entity update fails when config references a field that schema updates haven't created. The error is opaque. |
| `config_sync_directory` not set after upgrade from old project template | `cex`/`cim` write/read from the wrong path. Result: silent drift. |
| Mixing PHPUnit annotations and attributes in one file | PHPUnit honors attributes, drops annotations. Tests skip metadata you thought was active (e.g. group, dataProvider). |
| `run-tests.sh` for JS tests without ChromeDriver | Reports success silently with zero JS tests run. |
| `chromeOptions` in WebDriverTestBase config | Removed. Use `goog:chromeOptions`. |
| `AccessResult::allowedIf(...)` without cacheability | The result is cached under whatever context happened to be active — typical leak vector. Always `->cachePerPermissions()` (or the right context) and `->addCacheableDependency(...)`. |
| Procedural `#pre_render` string callable | Throws `UntrustedCallbackException` at runtime. |
| `Markup::create($user_input)` or `\|raw` on user input | Marks unfiltered input as safe → stored XSS. Use `#plain_text`, `processed_text`, or `Xss::filter()`. |
| Trusted host pattern without anchors | `'example.com'` matches `evil-example.com.attacker.tld` because the regex is unanchored. Use `'^example\.com$'` and escape the dot. |
| Hash salt from `\Drupal::service(...)` or hardcoded | Move to a file outside the docroot, read with `file_get_contents()`. Never commit. |
| Deploy without final `cache:rebuild` (or `:warm`) | First page hits rebuild caches synchronously — TTFB spikes for real users. |

## Quick reference

| Goal | Command |
|---|---|
| Update DB schema and data | `drush updatedb -y` |
| Import config | `drush config:import -y` |
| Run deploy hooks | `drush deploy:hook -y` |
| Wrapped deploy (updb → cim → cr → deploy:hook → cache:warm) | `drush deploy -y` |
| Rebuild cache | `drush cache:rebuild` |
| Generate hash salt | `drush php:eval 'echo \Drupal\Component\Utility\Crypt::randomBytesBase64(55);'` |
| Scan for deprecations before a major bump | `drupal/upgrade_status`, PHPStan + `mglaman/phpstan-drupal` + deprecation rules, `palantirnet/drupal-rector` |
| Run a single PHPUnit class | `./vendor/bin/phpunit -c web/core/phpunit.xml.dist <path-to-test>` |
| Run Nightwatch suite | `yarn test:nightwatch --tag <module>` |
| Migrate D7 to D11 | see `drupal11-migrate` (`migrate_upgrade` + `drush migrate:upgrade --configure-only`, on D11 only) |

## Cross-skill handoff

- Module code under deploy → `drupal11-module-development`
- Config sync directory and recipe-driven install → `drupal11-config-management`
- Cache warming after deploy, Redis bin layout → `drupal11-performance-caching`
- Twig debug toggle, asset aggregation in production → `drupal11-frontend-theming`
- Search API backend deployment for query layer → `drupal11-views-and-queries`
- Migration runs, `migrate:*` commands, D7 → D11 → `drupal11-migrate`

## Status at 11.4 and looking ahead

- `[fatto]` 11.4 stays on PHPUnit 11.5; the experimental MySQLi driver is still experimental (not a production target).
- `[since 11.4]` Password hashing is configurable and `argon2id` is available (Drupal 12 will default to it; hashes are upgraded at the next login).
- `[forward-looking 12.x]` The Drupal 12 development branch requires PHP 8.5, Symfony 8 and PHPUnit 12; Drush 13 supports Drupal 10.2–11 only, so D12 needs Drush 14 (not released yet). Validate against the D12 release notes before relying on any of them.
