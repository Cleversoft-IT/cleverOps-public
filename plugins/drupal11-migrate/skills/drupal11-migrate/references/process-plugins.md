# Process plugins — catalog and recipes

Companion to `../SKILL.md`. Lists verified against Drupal core 11.4.x (`core/modules/migrate/src/Plugin/migrate/process`) and migrate_plus 6.0.x (`src/Plugin/migrate/process`). Official doc: <https://www.drupal.org/docs/8/api/migrate-api/migrate-process-plugins/list-of-core-migrate-process-plugins>.

## Which module provides what

| Provider | Plugin IDs |
|---|---|
| `[core]` migrate | `array_build`, `callback`, `concat`, `default_value`, `download`, `entity_exists`, `explode`, `extract`, `file_copy`, `flatten`, `format_date`, `get`, `link_options`, `link_uri`, `log`, `machine_name`, `make_unique_entity_field`, `menu_link_parent`, `migration_lookup`, `null_coalesce`, `route`, `skip_on_empty`, `skip_row_if_not_set`, `static_map`, `sub_process`, `substr`, `timezone`, `urlencode`, `user_langcode` |
| `[contrib]` migrate_plus | `array_pop`, `array_shift`, `array_template`, `default_entity_value`, `dom`, `dom_apply_styles`, `dom_migration_lookup`, `dom_remove`, `dom_select`, `dom_str_replace`, `entity_generate`, `entity_lookup`, `entity_value`, `file_blob`, `gate`, `merge`, `multiple_values`, `preg_match`, `service`, `single_value`, `skip_on_value`, `snippet`, `str_replace`, `transpose` |
| `[contrib]` migrate_devel | `debug` |

`[since 11.4]` `link_options`, `link_uri`, `timezone` and `user_langcode` now live in the `migrate` module (same IDs; the old classes are deprecated). The D6/D7-only process plugins shipped by Migrate Drupal and the field modules are deprecated and disappear in D12 with it.

migrate_plus data parsers for the `url` source: `json`, `json_subitem`, `xml`, `simple_xml`, `soap`. There is no CSV parser: use `migrate_source_csv`.

## Values and constants

```yaml
source:
  constants:
    uid_admin: 1
    file_dest: 'public://products/'
process:
  uid: constants/uid_admin
  langcode:
    plugin: default_value
    default_value: it
  body/value: description          # write a sub-property directly
  body/format:
    plugin: default_value
    default_value: basic_html
  title:
    plugin: null_coalesce
    source: [title_it, title_en]  # first non-null
  field_slug:
    plugin: machine_name
    source: name
```

## Multi-value fields

```yaml
process:
  # Array of scalars → one delta each (the pipeline runs per item after explode)
  field_keywords:
    - plugin: explode
      source: keywords
      delimiter: '|'
    - plugin: callback
      callable: trim

  # Array of structured items → sub_process builds each delta
  field_links:
    plugin: sub_process
    source: links                   # e.g. [{url: ..., label: ...}, ...]
    process:
      uri: url
      title: label
```

`callback` with `unpack_source: true` calls a PHP function with several arguments (`source: [a, b]`); with `source: []` it calls the function without arguments. Keep `callable` to pure built-ins; anything with logic belongs in a custom process plugin.

## References to other entities

| Case | Plugin |
|---|---|
| Target was imported by another migration | `migration_lookup` (`migration: <id or list>`, `no_stub: true` unless stubs are wanted) |
| Target already exists on the site | `entity_lookup` `[contrib]` (`entity_type`, `bundle_key`, `bundle`, `value_key`, `ignore_case`) |
| Target may not exist: create it | `entity_generate` `[contrib]` (same keys + `values` / `default_values` for the new entity) |
| Just check an ID exists | `entity_exists` `[core]` |

Stubs: when `migration_lookup` cannot find a row and stubs are allowed, it creates a placeholder entity that a later run of the referenced migration fills in. Useful for circular references (e.g. parent terms); confusing everywhere else.

## Files and media

```yaml
process:
  _source_file:                     # leading underscore = pseudo-field, not saved
    plugin: concat
    source: [constants/source_base, filename]
  _dest_file:
    plugin: concat
    source: [constants/file_dest, filename]
  uri:
    plugin: file_copy               # or download for http(s) sources
    source: ['@_source_file', '@_dest_file']
    file_exists: rename
destination:
  plugin: 'entity:file'
```

Then reference the files from content with `migration_lookup` on the file migration, e.g. `field_image/target_id` and `field_image/alt`. For media, migrate files first, then `entity:media` with `field_media_image/target_id` from the file lookup, then reference media from nodes.

## Skipping, conditionally

| Goal | Plugin |
|---|---|
| Empty value → skip only this field | `skip_on_empty` with `method: process` |
| Empty value → skip the row | `skip_on_empty` with `method: row` (optional `message`) |
| Source key missing → skip the row | `skip_row_if_not_set` (`index`) |
| Specific value → skip | `skip_on_value` `[contrib]` (`value`, `not_equals`, `method`) |
| Process only when a condition holds | `gate` `[contrib]` |

In custom plugins: `$this->stopPipeline()` to stop processing the current property, `throw new MigrateSkipRowException($reason)` to skip the row with a message. `MigrateSkipProcessException` is deprecated (10.3) and removed in D12.

## Paragraphs (contrib)

1. One migration per paragraph type, destination `entity_reference_revisions:paragraph` (from the Entity Reference Revisions module) with `default_bundle`.
2. In the host migration, `migration_lookup` on a paragraph migration returns the pair `[id, revision_id]`; map it to `target_id` / `target_revision_id` (for multiple values, feed the list of pairs to `sub_process` with `target_id: '0'` and `target_revision_id: '1'`).
3. Declare the paragraph migrations in `migration_dependencies.required` and roll back the host before the paragraphs.
