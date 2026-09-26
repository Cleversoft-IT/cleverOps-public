---
name: drupal11-views-and-queries
description: Use when reading data from Drupal 11 — EntityQuery, Views plugins (field/filter/sort/argument/relationship/area/style/row/display/cache/access/pager), hook_views_data and hook_views_data_alter, hook_query_TAG_alter, hook_views_query_alter, computed Views fields, node_access tagging, and the choice between Views, EntityQuery, raw Database API, and Search API. Use when filtering by entity reference, computing virtual fields, or fixing access-related QueryException.
---

# Drupal 11 Views & Queries

## Overview

The query layer in Drupal 11 has three things you cannot get wrong: `accessCheck()` is mandatory on content entity queries, plugins are registered with PHP attributes (`#[ViewsField]`, `#[ViewsFilter]`, …), and Views data hooks are converting to OOP just like every other hook (`#[Hook('views_data_alter')]` in `src/Hook/`).

Pick the right tool: Views for site-builder-configurable listings, EntityQuery for tight programmatic lookup, raw Database API for reporting with `GROUP BY`/`HAVING`, Search API + Solr/OpenSearch for fulltext, facets, and datasets above ~50k. Baseline: **11.4.x**.

## When to use

- Building a custom Views field/filter/sort/argument/relationship/area/cache/access/pager
- Programmatic entity lookup with conditions
- Reporting queries that need aggregation or expressions
- Fulltext or faceted search
- Altering query behavior via `hook_query_TAG_alter` or `hook_views_query_alter`
- Diagnosing `QueryException: Entity queries must explicitly set whether the query should be access checked`

**When NOT to use:**
- A single `$storage->load($id)` lookup → just call it directly, no skill needed
- Render array / cacheability of the result page → `drupal11-performance-caching`
- New plugin discovery scaffolding (the attribute pattern itself) → `drupal11-module-development`

## Rule #1: `accessCheck()` is mandatory on content entity queries

Every query against a content entity (`node`, `media`, `taxonomy_term`, `user`, …) MUST declare its access stance. Forgetting it raises `QueryException` at runtime.

```php
$ids = $this->entityTypeManager->getStorage('node')->getQuery()
  ->accessCheck(TRUE)
  ->condition('type', 'article')
  ->condition('status', NodeInterface::PUBLISHED)
  ->condition('field_tags.entity:taxonomy_term.name', 'drupal')
  ->sort('created', 'DESC')
  ->range(0, 20)
  ->execute();

$nodes = $this->entityTypeManager->getStorage('node')->loadMultiple($ids);
```

**Critical subtlety:** `accessCheck(TRUE)` does **not** filter unpublished nodes by itself. It only invokes `node_access` grants — and unless your site uses a `node_grants` implementation (Workbench Access, Group, …) those grants do not filter by `status`. **Always add `->condition('status', 1)` (or `NodeInterface::PUBLISHED`) explicitly** when you want only published content.

For programmatic background tasks that must see everything regardless of permissions (cron, queue worker, migration), use `accessCheck(FALSE)` and document why.

## Rule #2: hooks convert to OOP — including Views data

`hook_views_data` and `hook_views_data_alter` are part of the OOP migration that started in 11.1. New code should declare them as methods on a class in `src/Hook/`, not in a `.views.inc` file.

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Hook;

use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\StringTranslation\TranslatableMarkup;

final class ViewsHooks {

  #[Hook('views_data_alter')]
  public function viewsDataAlter(array &$data): void {
    $data['node_field_data']['article_reading_time'] = [
      'title' => new TranslatableMarkup('Article reading time'),
      'help'  => new TranslatableMarkup('Estimated reading time (Article body).'),
      'field' => ['id' => 'article_reading_time'],
    ];
  }
}
```

Register the class in `my_module.services.yml`:

```yaml
services:
  Drupal\my_module\Hook\ViewsHooks:
    autowire: true
```

The legacy `MODULE.views.inc` + procedural `MODULE_views_data_alter()` still works during the migration window, but core itself is converting (`CommentViewsHooks::viewsDataAlter`, etc.) — follow suit.

## Custom Views field plugin (computed virtual field)

A field with no underlying DB column — leave `query()` empty and produce the value in `render()`:

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Plugin\views\field;

use Drupal\node\NodeInterface;
use Drupal\views\Attribute\ViewsField;
use Drupal\views\Plugin\views\field\FieldPluginBase;
use Drupal\views\ResultRow;

#[ViewsField('article_reading_time')]
final class ArticleReadingTime extends FieldPluginBase {

  private const WORDS_PER_MINUTE = 200;

  public function query() {
    // Virtual field — no SQL column to register.
  }

  public function render(ResultRow $values) {
    $entity = $this->getEntity($values);
    if (!$entity instanceof NodeInterface || $entity->get('body')->isEmpty()) {
      return '';
    }
    $words = preg_split('/\s+/u', strip_tags((string) $entity->get('body')->value), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $minutes = max(1, (int) ceil(count($words) / self::WORDS_PER_MINUTE));
    return $this->t('@n min read', ['@n' => $minutes]);
  }

  public function clickSortable() {
    return FALSE;
  }
}
```

Make it discoverable by Views via the `views_data_alter` hook above. The same attribute family covers filters, sorts, arguments, relationships, areas, styles, rows, displays, cache, access, pagers: `#[ViewsFilter]`, `#[ViewsSort]`, `#[ViewsArgument]`, `#[ViewsRelationship]`, `#[ViewsArea]`, `#[ViewsStyle]`, `#[ViewsRow]`, `#[ViewsDisplay]`, `#[ViewsCache]`, `#[ViewsAccess]`, `#[ViewsPager]`.

## Tool decision matrix

| Need | Tool | Why |
|---|---|---|
| Site-builder-configurable listing | Views | UI exposes filters/sorts/displays, cacheability handled |
| Tight programmatic ID-only lookup | EntityQuery | `accessCheck()`, condition syntax with entity reference traversal |
| Reporting with `GROUP BY` / `HAVING` / SQL expressions | Database API + `addTag('node_access')` | EntityQuery aggregate has no custom expressions |
| Fulltext, facets, autocomplete, dataset > ~50k | Search API + Solr / OpenSearch / Meilisearch | Inverted index, language analyzers, sub-second facets |

**Do not use Drupal core `search` module past a few hundred thousand nodes.** Its SQL inverted index is costly to reindex and Views has no native faceting against it. Search API + a dedicated backend is the canonical pick.

## Query alter & node_access tagging

Every query that returns node data for the UI must be tagged:

```php
$query->addTag('node_access');
$query->addMetaData('base_table', 'node_field_data'); // when base table differs
```

Then alter via:

```php
#[Hook('query_node_access_alter')]
public function queryNodeAccessAlter(AlterableInterface $query): void {
  // ...
}
```

For Views query alter, **always check it is the SQL backend before touching SQL-shaped APIs** — otherwise you break Search API and any other non-SQL Views backend:

```php
#[Hook('views_query_alter')]
public function viewsQueryAlter(ViewExecutable $view, QueryPluginBase $query): void {
  if (!$query instanceof Sql) {
    return; // Search API / other backend — skip.
  }
  // safe to call $query->addWhere(...), addField(...), etc.
}
```

## Aggregate queries — limitation

`getAggregateQuery()` exists, but EntityQuery aggregate **does not support custom SQL expressions** like `SUM(field_x * field_y)`. Workaround: drop to Database API with `addTag('node_access')` and `addExpression(...)`, or implement a `hook_query_TAG_alter` that adds the expression to a tagged EntityQuery.

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| Missing `accessCheck()` | Runtime `QueryException` on every content entity query. |
| Assuming `accessCheck(TRUE)` filters unpublished | Without `node_grants`, grants do not check `status`. Always add `condition('status', 1)`. |
| Computed / pseudo fields used in conditions | Not queryable — neither in EntityQuery nor JSON:API. Pre-compute, index in Search API, or expose via a Views field with empty `query()`. |
| `hook_views_query_alter` without `instanceof Sql` | Breaks every non-SQL backend (Search API, MongoDB, …). |
| `sort('random')` on large datasets | Forces full sort of the result set — orders of magnitude slower than ordered queries. Use a randomized cache buster or pre-shuffled ID pool. |
| Cache time-based on Views with `node_list` | Saving any node invalidates the listing. Use `node_list:<bundle>` (since 8.9) or `views_custom_cache_tag` `[contrib]` for finer granularity. |
| `loadByProperties()` unbounded | Loads every match into memory. Add a `range(0, N)` upper bound. |
| Forgetting `accessCheck(FALSE)` rationale | Background jobs that legitimately need it should comment why; otherwise readers assume a bug. |

## Quick reference

| Task | Pattern |
|---|---|
| Listing of N entities by condition | `$storage->getQuery()->accessCheck(TRUE)->condition(...)->range(0, N)->execute()` then `loadMultiple()` |
| Filter by entity-reference field by target property | `condition('field_tags.entity:taxonomy_term.name', 'drupal')` |
| Custom Views field with no DB column | `#[ViewsField]` plugin, empty `query()`, value in `render()`, register via `views_data_alter` hook |
| Tag query for node access | `$query->addTag('node_access')` + `addMetaData('base_table', 'node_field_data')` if not on `node_field_data` |
| Alter query of a tag | `#[Hook('query_TAG_alter')]` method |
| Alter Views query (SQL only) | `#[Hook('views_query_alter')]` with `instanceof Sql` guard |

## Cross-skill handoff

- Plugin attribute pattern, `#[Hook]` mechanics, services.yml wiring → `drupal11-module-development`
- Cache tags/contexts on listing output (`node_list`, `node_list:<bundle>`, custom tags) → `drupal11-performance-caching`
- Default content / fixtures for testing queries → `drupal11-config-management`
- Search API + Solr backend deployment → `drupal11-devops-testing-security`

## Status at 11.4 and looking ahead

- `[since 11.4] [fatto]` Entity listing queries generate fewer table joins and entity field loading needs about half the queries of 11.3 — a free win for EntityQuery, Views and JSON:API listings, no API change.
- `[fatto]` The MySQLi driver is still **experimental** in 11.4: no parallel-query API to target from EntityQuery or Views yet.
- `[forward-looking 12.x]` Async/parallel query execution (MySQLi + Fibers) for Views and entity loads is still in progress upstream. Do not rely on the API surface until a release note announces it.
