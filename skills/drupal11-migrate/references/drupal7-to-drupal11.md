# Drupal 6/7 → Drupal 11

Companion to `../SKILL.md`. Status verified on Drupal 11.4 (September 2026).

## The constraint that drives everything

- **Migrate Drupal** (the D6/D7 source plugins and field mappings) is **deprecated in 11.4.0** and **Migrate Drupal UI** (`/upgrade`) in **11.3.0**; both are **removed in Drupal 12.0** and are **not moving to contrib** (change records <https://www.drupal.org/node/3566999>, <https://www.drupal.org/node/3533901>; <https://www.drupal.org/docs/core-modules-and-themes/deprecated-and-obsolete>).
- About 45 legacy-upgrade process plugins (D6/D7 field and block mappings) were deprecated in 11.3 for removal in 12.0 (<https://www.drupal.org/node/3533560>).
- Official recommendation: sites still on Drupal 6 or 7 **migrate to Drupal 11**, then upgrade to Drupal 12 like any D11 site. Drupal 11 receives long-term support (expected through the end of 2028), so there is time — but not on a D12 codebase.
- Drupal 7 itself reached end of life on 5 January 2025.

`[regola]` Pin the migration project to `drupal/core-recommended:^11` until the last migration has run in production, then uninstall Migrate Drupal, `migrate_upgrade` and your migration module, and only then plan D12. Deprecation notices from these modules on 11.4 are expected.

## Setup

```php
// settings.php of the D11 site — source database, read-only user recommended.
$databases['migrate']['default'] = [
  'driver' => 'mysql',
  'database' => 'd7_source',
  'username' => 'd7_reader',
  'password' => getenv('D7_DB_PASSWORD'),
  'host' => '127.0.0.1',
  'prefix' => '',
];
```

```bash
composer require drupal/migrate_plus drupal/migrate_tools drupal/migrate_upgrade
drush en migrate_drupal migrate_plus migrate_tools migrate_upgrade phpass -y
```

`migrate_upgrade` (4.0.x) depends on `migrate_drupal` and `migrate_plus`, so it only works while Migrate Drupal is in core, i.e. on Drupal 11.

## Generate, select, customize, run

```bash
# 1. Generate migrate_plus config entities from the D7 site, without running them
drush migrate:upgrade --legacy-db-key=migrate --legacy-root=https://www.example.com --configure-only
#    (alias: mup; --legacy-db-url=mysql://user:pass@host/db instead of --legacy-db-key;
#     --migration-prefix=d7_ to change the default "upgrade_" prefix;
#     --legacy-root = base URL or local path of the D7 files, used by file migrations)
#    Result: active config migrate_plus.migration.upgrade_d7_* in group "migrate_drupal_7".

# 2. Inspect exactly what was generated (migrate_tools)
drush migrate:status --group=migrate_drupal_7

# 3. Export and copy ONLY the migrations you keep into a module you own
drush config:export -y
#    copy the kept config/sync/migrate_plus.migration.upgrade_d7_*.yml and
#    migrate_plus.migration_group.migrate_drupal_7.yml into
#    web/modules/custom/my_d7_migration/config/install/, drop the "uuid" and "_core" keys,
#    add dependencies: { enforced: { module: [my_d7_migration] } }.

# 4. Delete from ACTIVE config every generated migration you are NOT keeping.
#    Removing a file from your module (or reimporting with --partial) does not delete it:
#    it stays on the site and runs with the group/tag.
drush sql:query "SELECT name FROM config WHERE name LIKE 'migrate_plus.migration.upgrade_d7_%'"
drush config:delete migrate_plus.migration.upgrade_d7_comment_field   # one per discarded id
drush migrate:status --group=migrate_drupal_7                        # must list only what you kept

# 5. Run explicit ids, small first, dependencies included
drush migrate:import upgrade_d7_user --limit=50
drush migrate:messages upgrade_d7_user
drush migrate:import upgrade_d7_user,upgrade_d7_file,upgrade_d7_node_article --execute-dependencies
#    or the whole curated group (migrate_tools): drush migrate:import --group=migrate_drupal_7
```

**Do not select with `--tag="Drupal 7"` or `--all`.** With Migrate Drupal enabled, core also exposes its own `d7_*` migration plugins with that tag, next to every generated `upgrade_d7_*` still in active config: the tag would run migrations you never reviewed. Select by explicit ids or by the curated group.

Customizations belong in the YAML of your module (process pipelines, `static_map` of text formats, skipping obsolete fields), or in custom process plugins with `#[MigrateProcess]`. Reload edited config entities with `drush config:import --partial --source=modules/custom/my_d7_migration/config/install` (it adds and updates, never deletes) before re-running with `--update`.

## Before production

- **Keep the source**: a frozen, read-only copy of the D7 database and files for the whole project (and after go-live, until acceptance) — you will re-run migrations and compare results.
- **Document the mapping**: per migration, source → destination fields, transformations, what is dropped and why (a table in the module README or comments in the YAML). It is the acceptance checklist for the client.
- **Backup and rehearse**: dump the D11 database and files before every production run (`drush sql:dump --gzip --result-file=...` plus the files directory), rehearse the full run on a copy of production, time it, and write down the restore procedure. `migrate:rollback` only deletes what the map says was created; it does not restore overwritten data.

## Typical adjustments

| Topic | What to do |
|---|---|
| Content model changes | Build the D11 content model first (fields, bundles, media types), then map in `process`; do not let the generated field migrations create a copy of the D7 model you do not want. |
| Text formats | `static_map` the D7 format IDs (`filtered_html`, `full_html`, …) to D11 ones and review embedded markup (images, `<script>`). |
| Files → Media | Migrate files first (`upgrade_d7_file`), then media entities referencing them, then point content fields at media. |
| Users and passwords | Enable the core **Password Compatibility** module (`phpass`): without it D7 password hashes are not accepted. They are rehashed at the next login; uninstall `phpass` only when no legacy hash is left. Map roles explicitly. |
| URL aliases and redirects | Migrate `path_alias`; add `redirect` (contrib) entries for URLs that change. |
| Contrib data (Paragraphs, Field Collection, Webform, …) | Check each project for a D7 migration path; Field Collection → Paragraphs needs dedicated migrations. |
| Custom D7 tables | Write a source plugin extending `SqlBase` with `#[MigrateSource]` and `key: migrate`. |

## Cut-over and cleanup

1. Freeze the D7 site, take the backups above, run a final `drush migrate:import --group=migrate_drupal_7 --update` (or the explicit id list), verify against the mapping document.
2. Uninstall `migrate_upgrade`, your migration module (its enforced config goes with it), `migrate_drupal`, and the contrib migrate modules you no longer need.
3. Remove `$databases['migrate']` from `settings.php`.
4. Only now run the D12 readiness checks (see `drupal11-devops-testing-security`).
