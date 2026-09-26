---
name: drupal11-migrate
description: Use when importing data into Drupal 11 with the Migrate API — writing migration YAML (migrations/*.yml plugins or migrate_plus config entities), CSV sources (migrate_source_csv), JSON/XML/HTTP sources (migrate_plus url with data fetcher/parser), process pipelines (static_map, migration_lookup, sub_process, entity_lookup, entity_generate, skip_on_empty), custom source/process plugins with the MigrateSource / MigrateProcess PHP attributes, running drush migrate:import --update --limit --idlist, migrate:rollback, migrate:reset-status, migrate:messages, debugging stuck or failing migrations, and planning D6/D7 → D11 migrations now that Migrate Drupal is deprecated (11.4) and removed in D12. Drupal 11 specific.
---

# Drupal 11 Migrate

## Overview

A migration is a pipeline **source → process → destination**, run row by row, with an ID map (`migrate_map_<id>`) that remembers what was imported and a message table (`migrate_message_<id>`). The core `migrate` module stays in Drupal 12; almost everything else you need for real-world imports is **contrib**. Baseline: **Drupal 11.4.x**, **Drush 13**.

| Module | Where | Role |
|---|---|---|
| `migrate` | `[core]` | API, core source/process/destination plugins, `embedded_data` source |
| `migrate_drupal`, `migrate_drupal_ui` | `[core]`, **deprecated** (11.4 / 11.3), removed in D12 | D6/D7 sources and the `/upgrade` UI — see "Drupal 6/7 → 11" |
| `migrate_plus` 6.0.x | `[contrib]` | Migrations as config entities, `migration_group`, `url` source (JSON/XML/SOAP over HTTP or file), `entity_lookup`, `entity_generate`, `skip_on_value`, … |
| `migrate_tools` 6.1.x | `[contrib]` | Drush extras (`--group`, `--sync`, `--continue-on-failure`, `migrate:tree`) and an admin UI |
| `migrate_source_csv` 3.x | `[contrib]` | `csv` source plugin |
| `migrate_devel` | `[contrib]` | `--migrate-debug` and a `debug` process plugin (3.1.x for 11.3+/12) |

```bash
composer require drupal/migrate_plus drupal/migrate_tools drupal/migrate_source_csv
drush en migrate migrate_plus migrate_tools migrate_source_csv -y
```

The `migrate:*` Drush commands themselves are in **Drush core** (since Drush 10.4); `migrate_tools` only adds options and commands on top.

## When to use

- Importing content, users, terms, files from CSV, JSON/XML APIs, another database, or a Drupal 6/7 site
- Writing or fixing migration YAML, process pipelines, custom source/process plugins
- Running, updating, rolling back, or unblocking migrations; reading migration messages

**When NOT to use:**
- One-off data fixes during a deploy (`hook_post_update_NAME`, `hook_deploy_NAME`) → `drupal11-devops-testing-security`
- Shipping default content with a site/recipe (`content:export`, recipes) → `drupal11-config-management`
- General plugin/DI patterns, scaffolding with `drush generate` → `drupal11-module-development`
- Querying the imported data → `drupal11-views-and-queries`

## Where migrations live — pick one form

| | Plugin: `MODULE/migrations/<id>.yml` | Config entity: `MODULE/config/install/migrate_plus.migration.<id>.yml` |
|---|---|---|
| Requires | core only | `migrate_plus` |
| Reload after editing | `drush cr` | `drush config:import --partial --source=modules/custom/MODULE/config/install` (or reinstall the module) |
| Groups (`migration_group`) | yes, if migrate_plus is enabled | yes, plus shared config in `migrate_plus.migration_group.<id>.yml` |
| Overrides / UI | code only | editable config, `settings.php` overrides |
| Best for | code-owned migrations shipped in a module | generated migrations (e.g. `migrate:upgrade`), per-environment tweaks |

`[regola]` Put migrations in a dedicated module (`my_migration`) you can uninstall after go-live. For config entities add `dependencies: { enforced: { module: [my_migration] } }` so uninstalling the module deletes them.

## Anatomy of a migration

```yaml
# my_migration/migrations/products.yml
id: products
label: 'Products from CSV'
migration_group: catalog            # needs migrate_plus
migration_tags: [catalog]
source:
  plugin: csv
  path: 'private://import/products.csv'
  ids: [sku]
  constants:
    status: 1
process:
  type:
    plugin: default_value
    default_value: product
  title: name
  field_sku: sku
  field_price: price
  status: constants/status
  uid:
    plugin: migration_lookup
    migration: users
    source: owner_id
    no_stub: true
  field_category:
    plugin: migration_lookup
    migration: categories
    source: category_id
destination:
  plugin: 'entity:node'
  default_bundle: product
migration_dependencies:
  required: [users, categories]
```

Process shorthand: `title: name` is `plugin: get`. A list of plugins runs as a pipeline, each receiving the previous output. `@field_x` reads a destination property computed earlier in the same row; `constants/…` reads the `constants` block of the source.

Destination options worth knowing (`entity:*`): `default_bundle`, `overwrite_properties: [field_a, field_b]` (update only these on existing entities), `validate: true` (run entity validation, failures become messages), `translations: true` (rows are translations).

## Sources

### CSV — `migrate_source_csv` 3.x `[contrib]`

```yaml
source:
  plugin: csv
  path: 'private://import/products.csv'   # stream wrapper or absolute path
  ids: [sku]
  header_offset: 0            # row holding the headers; null = no header row
  delimiter: ';'              # default ','
  enclosure: '"'
  fields:                     # optional with a header row; required without one
    - name: sku
      label: 'SKU'
    - name: name
      label: 'Product name'
```

`[fatto]` 3.x keys are `ids`, `header_offset`, `fields` (`name`/`label`), `delimiter`, `enclosure`, `escape`, `create_record_number` / `record_number_field`. The 2.x keys `keys`, `header_row_count`, `column_names` are **silently ignored** by 3.x — a very common copy-paste bug. A relative `path` is resolved against the process working directory; prefer a stream wrapper or an absolute path.

### JSON / XML / HTTP — `migrate_plus` `url` source `[contrib]`

```yaml
source:
  plugin: url
  data_fetcher_plugin: http        # or: file (local path / stream wrapper)
  data_parser_plugin: json         # json | xml | simple_xml | soap
  urls:
    - 'https://api.example.com/v1/users'
  item_selector: data              # path to the array of items
  headers:
    Accept: 'application/json'
  fields:
    - name: id
      label: 'Remote ID'
      selector: id
    - name: email
      label: 'Email'
      selector: attributes/email
  ids:
    id:
      type: integer
process:
  name: email
  mail: email
  init: email
  status:
    plugin: default_value
    default_value: 1
destination:
  plugin: 'entity:user'
```

`http` also accepts `authentication` (`plugin: basic | digest | oauth2 | …`), `request_options` and `method`; paged APIs use the `pager` settings of the parser. **Never commit credentials in migration YAML**: inject them at runtime from `settings.php` via a `#[Hook('migration_plugins_alter')]` method that reads `Settings::get('my_api_token')` and sets `$migrations['api_users']['source']['headers']['Authorization']`.

### Other sources

- `embedded_data` `[core]` — rows inline in YAML (`data_rows`, `ids`): fixtures, tests, small lookup lists.
- Another SQL database — a custom source extending `SqlBase` (below) with `key: legacy` pointing at `$databases['legacy']['default']` in `settings.php`.
- Incremental imports: `high_water_property` (e.g. a `changed` timestamp) imports only newer rows; `track_changes: true` re-imports rows whose source hash changed (use one or the other).

## Process plugins — the everyday set

```yaml
process:
  field_type:
    plugin: static_map
    source: type
    map: { old_a: new_a, old_b: new_b }
    default_value: other            # without it an unmapped value skips the row
  title:
    plugin: concat
    source: [first_name, last_name]
    delimiter: ' '
  field_tags:                       # "a, b, c" → term references, created if missing
    - plugin: explode
      source: tags
      delimiter: ','
    - plugin: callback
      callable: trim
    - plugin: entity_generate       # [contrib] migrate_plus
      entity_type: taxonomy_term
      bundle_key: vid
      bundle: tags
      value_key: name
  field_image:
    - plugin: skip_on_empty
      method: process               # empty → leave this field empty
      source: image_fid
    - plugin: migration_lookup
      migration: files
  created:
    plugin: format_date
    source: published_at
    from_format: 'Y-m-d H:i:s'
    to_format: 'U'
```

`skip_on_empty` with `method: row` skips the whole row; `skip_row_if_not_set` skips when a key is missing. `entity_lookup` / `entity_generate` / `skip_on_value` come from **migrate_plus**, not core. Full catalog (core vs contrib), multi-value `sub_process`, files and paragraphs: `references/process-plugins.md`.

## Custom plugins use PHP attributes

Scaffold with `drush generate plugin:migrate:source` / `plugin:migrate:process` (see `drupal11-module-development`), then keep the attribute form below.

### Source plugin — `#[MigrateSource]` `[since 11.2]`

```php
<?php

declare(strict_types=1);

namespace Drupal\my_migration\Plugin\migrate\source;

use Drupal\migrate\Attribute\MigrateSource;
use Drupal\migrate\Plugin\migrate\source\SqlBase;
use Drupal\migrate\Row;

#[MigrateSource('legacy_products')]
final class LegacyProducts extends SqlBase {

  public function query() {
    return $this->select('legacy_products', 'p')
      ->fields('p', ['id', 'name', 'price_cents', 'description'])
      ->condition('p.status', 'active')
      ->orderBy('p.id');
  }

  public function fields(): array {
    return [
      'id' => $this->t('Product ID'),
      'name' => $this->t('Name'),
      'price_cents' => $this->t('Price in cents'),
      'description' => $this->t('Description'),
    ];
  }

  public function getIds(): array {
    return ['id' => ['type' => 'integer', 'alias' => 'p']];
  }

  public function prepareRow(Row $row): bool {
    $row->setSourceProperty('name', trim((string) $row->getSourceProperty('name')));
    return parent::prepareRow($row);
  }
}
```

```yaml
source:
  plugin: legacy_products
  key: legacy            # $databases['legacy']['default'] in settings.php
```

`[fatto]` Attribute signature: `MigrateSource(id, requirements_met = TRUE, minimum_version = NULL, deriver = NULL)`. There is **no `source_module` parameter** — passing it is a fatal error; `source_module` only mattered for Migrate Drupal's `DrupalSqlBase` sources, which still use annotations. On 11.0/11.1 source plugins must use the `@MigrateSource` annotation. Source plugins receive the migration as an extra constructor argument, so the autowired `create()` of `PluginBase` does not apply: `SqlBase` already provides `create()`; override it by hand if you inject more services.

### Process plugin — `#[MigrateProcess]` `[since 10.3]`

```php
<?php

declare(strict_types=1);

namespace Drupal\my_migration\Plugin\migrate\process;

use Drupal\migrate\Attribute\MigrateProcess;
use Drupal\migrate\MigrateExecutableInterface;
use Drupal\migrate\ProcessPluginBase;
use Drupal\migrate\Row;

/**
 * Converts an integer amount in cents to a decimal string.
 *
 * @code
 * field_price:
 *   plugin: cents_to_decimal
 *   source: price_cents
 * @endcode
 */
#[MigrateProcess('cents_to_decimal')]
final class CentsToDecimal extends ProcessPluginBase {

  public function transform($value, MigrateExecutableInterface $migrate_executable, Row $row, $destination_property) {
    if ($value === NULL || $value === '' || !is_numeric($value)) {
      $this->stopPipeline();   // leave the field empty, keep the row
      return NULL;
    }
    return number_format((int) $value / 100, 2, '.', '');
  }
}
```

- `MigrateProcess(id, handle_multiples = FALSE, deriver = NULL)`: set `handle_multiples: TRUE` only if `transform()` itself handles arrays.
- Stop the rest of the pipeline with `$this->stopPipeline()` (since 10.3). `MigrateSkipProcessException` is deprecated and removed in D12. Skip the whole row with `throw new MigrateSkipRowException('reason')` — the reason is saved as a message.
- Process plugins extend `PluginBase`, so on 11.3+ implementing `ContainerFactoryPluginInterface` gives an autowired `create()` for extra services.
- Destination plugins use `#[MigrateDestination(id, requirements_met, destination_module, deriver)]` `[since 10.3]`.

## Running migrations — Drush 13

```bash
drush migrate:status                          # ms — also --tag=..., (migrate_tools: --group=...)
drush migrate:import products --limit=10      # mim — smoke test on 10 rows
drush migrate:messages products               # mmsg — what failed and why
drush migrate:import products --update        # re-process already-imported rows too
drush migrate:import products --idlist=42 --update   # re-run one row (compound ids: 42:it)
drush migrate:import --tag=catalog --execute-dependencies
drush migrate:rollback products               # mr — delete what the migration created
drush migrate:stop products                   # mst — ask a running import to stop
drush migrate:reset-status products           # mrs — unblock "busy with another operation"
drush migrate:fields-source products          # mfs — list source fields
```

- `--update` re-processes **all** previously imported rows (and imports new ones); combine with `--limit` / `--idlist` to keep it small.
- `--delete` (Drush core) removes destination entities whose source rows disappeared; it is incompatible with `--limit`, `--idlist` and `high_water_property`. `migrate_tools` offers the same idea as `--sync`.
- `--feedback=500` prints progress; `--force` ignores unmet dependencies (use deliberately).
- With `migrate_tools` enabled check `drush help migrate:import` on the site: it adds options such as `--group`, `--sync`, `--continue-on-failure`.

## Debugging

1. `drush migrate:status <id>` — is it `Idle`, and how many rows are imported/unprocessed?
2. `drush migrate:messages <id>` — per-row errors; also in the `migrate_message_<id>` table.
3. Re-run one row: `drush migrate:import <id> --idlist=<source id> --update -vvv`.
4. Inspect values in the pipeline: insert `- plugin: log` (core, logs and passes the value through) or `- plugin: callback` with `callable: var_dump`, or install `migrate_devel` and run with `--migrate-debug` (or add its `debug` process plugin).
5. Look at the map: `drush sql:query "SELECT * FROM migrate_map_<id> WHERE sourceid1 = '42'"` — `source_row_status` 0 imported, 1 needs update, 2 ignored, 3 failed.
6. Reference: <https://www.drupal.org/docs/drupal-apis/migrate-api/debugging-migrations>

## Before a production run

- **Keep the source** frozen and read-only (database dump, CSV/JSON files, API snapshot) for the life of the project: you will re-run, compare, and answer "where did this value come from?".
- **Document the mapping** per migration — source field → destination field, transformation, what is dropped and why — in the module README or YAML comments. It is the acceptance checklist.
- **Back up and rehearse**: dump database and files before every production run, rehearse on a copy of production, time it, and write down the restore procedure. `migrate:rollback` deletes what the map says was created; it cannot restore data a migration overwrote.
- **Select precisely**: run explicit ids or a curated group/tag you own; never `--all` on a site where other modules expose migrations.

## Drupal 6/7 → 11

`[fatto]` **Migrate Drupal is deprecated in 11.4 and Migrate Drupal UI in 11.3; both are removed in Drupal 12 and are not moving to contrib.** D6/D7 sites must be migrated to **Drupal 11** (still supported through the 11.x LTS) and upgraded to D12 afterwards. Do not start a D7 migration on a D12 codebase. Workflow (`migrate_upgrade`, `--legacy-db-key`, selecting and deleting generated migrations, customizing them, backups, legacy process plugins removed in D12): `references/drupal7-to-drupal11.md`.

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| migrate_source_csv 2.x keys (`header_row_count`, `column_names`, `keys`) on 3.x | Ignored silently: wrong headers, missing fields, or no IDs. Use `header_offset`, `fields`, `ids`. |
| `#[MigrateSource(id: ..., source_module: ...)]` | Unknown named parameter → fatal at discovery. `source_module` does not exist on the attribute. |
| Editing YAML and re-running without reloading | Plugins: `drush cr`. Config entities: `drush config:import --partial --source=...`. Otherwise the old definition runs. |
| "Migration X is busy with another operation: Importing" | A previous run died. `drush migrate:reset-status X`, then re-run. |
| Re-running without `--update` | Already-imported rows are skipped; your process fix never reaches them. |
| `migration_lookup` on a migration not yet run | Creates **stubs** (empty entities). Declare `migration_dependencies` and use `no_stub: true` where a stub makes no sense. |
| `static_map` without `default_value` (or `bypass: true`) | Any unmapped value skips the whole row with a message. |
| `entity_lookup` / `entity_generate` / `skip_on_value` without migrate_plus | "Plugin does not exist" — they are contrib. |
| `MigrateSkipProcessException` in custom plugins | Deprecated since 10.3, removed in D12. Use `$this->stopPipeline()`. |
| Rolling back a migration that updates existing entities | Rollback deletes what the map says it created; with `overwrite_properties` on pre-existing entities it cannot restore old values. Back up first. |
| Huge single run | Memory grows; run in slices with `--limit` / `--idlist`, or tags/groups, and use `--feedback`. |
| Credentials in YAML under `config/install` | Exported and committed. Inject from `settings.php` via `hook_migration_plugins_alter`. |

## Quick reference

| Goal | How |
|---|---|
| New migration (core only) | `MODULE/migrations/<id>.yml`, then `drush cr` |
| New migration as config | `config/install/migrate_plus.migration.<id>.yml` (+ enforced module dependency) |
| CSV source | `plugin: csv`, `path`, `ids`, `header_offset`, `fields` |
| JSON over HTTP | `plugin: url`, `data_fetcher_plugin: http`, `data_parser_plugin: json`, `item_selector`, `fields[].selector`, `ids` |
| Reference another migration | `plugin: migration_lookup`, `migration: <id>`, `no_stub: true` |
| Custom source / process | `#[MigrateSource('id')]` (11.2+) / `#[MigrateProcess('id')]` |
| Smoke test | `drush mim <id> --limit=10` then `drush mmsg <id>` |
| Re-import changed rows | `drush mim <id> --update` (or `track_changes: true` in the source) |
| Unblock | `drush mrs <id>` |

## Cross-skill handoff

- Plugin scaffolding (`drush generate plugin:migrate:*`), DI, attributes → `drupal11-module-development`
- Config sync of `migrate_plus.migration.*`, partial imports, recipes/default content → `drupal11-config-management`
- Deploy-time data fixes, D10 → D11 / D11 → D12 upgrades, PHPUnit for migrations → `drupal11-devops-testing-security`
- Cache invalidation after bulk imports (`node_list` tags) → `drupal11-performance-caching`
- Checking imported data with EntityQuery / Views → `drupal11-views-and-queries`
