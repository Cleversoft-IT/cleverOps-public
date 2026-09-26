---
name: drupal11-performance-caching
description: Use when working on Drupal 11 cache metadata (tags / contexts / max-age), render array cacheability, lazy builders, BigPipe, page_cache vs dynamic_page_cache, Cache API, Redis or Memcache backends, CacheableResponse, TrustedCallbackInterface. Use when symptoms are users seeing each other's data, cache not invalidating, high TTFB, or stale content. Use when reviewing cache metadata on a render array.
---

# Drupal 11 Performance & Caching

## Overview

Drupal's cacheability is governed by a **trio** that bubbles up the render tree: **tags** (what invalidates this), **contexts** (what varies this), **max-age** (how long it lives). Get the trio right and every caching layer above (render cache, Dynamic Page Cache, Internal Page Cache, BigPipe, reverse proxy) does the right thing automatically. Get it wrong and you leak data between users, serve stale content, or DDoS your DB.

`[since 11.3]` Two big shifts: BigPipe was rewritten on **HTMX** (no more `core/drupal.ajax` dependency, JS payload down ~60-71%), and core got **PHP Fibers** for parallel entity loads — measured ~31% fewer SQL queries on cold cache and ~50% on partially warm cache. `[since 11.4]` entity field loading and listing queries were optimized again (about half the queries of 11.3 on many requests). Baseline: **11.4.x**.

## When to use

- Setting cache metadata on a render array, response, or block
- Diagnosing "users see each other's data" or "cache doesn't invalidate"
- Wiring `#lazy_builder` and `TrustedCallbackInterface`
- Configuring Redis / Memcache / chainedfast bins
- Understanding which caching layer is serving (or not serving) a request
- Auditing for early rendering / metadata loss

**When NOT to use:**
- Plugin / hook / service scaffolding patterns → `drupal11-module-development`
- EntityQuery / Views query plugins / list cache tag granularity at query level → `drupal11-views-and-queries`
- Twig template performance, SDC asset attachment → `drupal11-frontend-theming`
- Redis enabling and `settings.php` for production → `drupal11-devops-testing-security`

## The cache trio

| Component | Default | Purpose | Examples |
|---|---|---|---|
| **Tags** | none | What event invalidates this | `node:1`, `user:5`, `node_list`, `node_list:article`, `config:system.site`, custom `myproject:dashboard` |
| **Contexts** | none | What dimensions vary this | `user`, `user.roles[:role]`, `user.permissions`, `user.node_grants[:op]`, `url`, `url.path`, `url.query_args[:arg]`, `languages[:type]`, `cookies:NAME`, `route`, `theme`, `timezone` |
| **Max-age** | `Cache::PERMANENT` | How long it lives | `Cache::PERMANENT` (default, preferred), N seconds, `0` (uncacheable, **avoid at top level**) |

**Rule:** prefer **tag-based invalidation over time-based**. `max-age: 0` at the page level kills every page-cache layer and forces a full rebuild on every request. Time-based makes sense for a clock or a stock ticker — not for "the comment count was wrong for two minutes."

Entity save automatically invalidates `ENTITY_TYPE:ID` plus `ENTITY_TYPE_list[:BUNDLE]`. Manual invalidation:

```php
\Drupal::service('cache_tags.invalidator')->invalidateTags(['myproject:dashboard']);
// or, via the Cache helper:
\Drupal\Core\Cache\Cache::invalidateTags(['myproject:dashboard']);
```

## Render array — the canonical pattern

**The render array's `#cache` key is the single source of truth for cacheability.** Tags / contexts / max-age **bubble** up automatically. `#cache.keys` is required only for *storage* in the render cache; if you omit `#cache.keys`, the metadata still bubbles to the response — the element just isn't itself stored.

```php
public function build(): array {
  $uid = (int) $this->currentUser->id();
  $count = $this->countUnreadNotifications($uid);

  return [
    '#markup' => $this->t('Welcome, @name. You have @n unread notifications.', [
      '@name' => $this->currentUser->getDisplayName(),
      '@n' => $count,
    ]),
    '#cache' => [
      'contexts' => ['user'],                          // varies per user → no leak
      'tags' => ['user:' . $uid, 'node_list:notification'], // entity + custom list tag
      'max-age' => Cache::PERMANENT,
    ],
  ];
}
```

**Do not** double-up by also overriding `getCacheContexts()` / `getCacheTags()` / `getCacheMaxAge()` on the block class — those exist for the case where the block has metadata even before `build()` runs (block-level access checks that depend on context). For the common case the render array `#cache` is enough.

For responses (controllers returning JSON, redirects, etc.), use the cacheable variants and merge dependencies in:

```php
$response = new CacheableJsonResponse($payload);
$response->addCacheableDependency($node);                      // node:NID + bundle list
$response->getCacheableMetadata()
  ->addCacheContexts(['user.permissions'])
  ->addCacheTags(['myproject:dashboard']);
return $response;
```

`CacheableJsonResponse`, `CacheableRedirectResponse`, `CacheableResponse` exist for exactly this.

Programmatic manipulation:

```php
$meta = CacheableMetadata::createFromRenderArray($build);
$meta->addCacheContexts(['user.permissions']);
$meta->applyTo($build);
```

## `#lazy_builder` — keep the page cacheable

When one part of a render tree must be uncacheable (per-request data, real-time clock) but the rest could be cached, isolate it in a lazy builder. The page caches normally; the lazy slot is rendered separately and merged in.

```php
public function build(): array {
  return [
    '#lazy_builder' => [TimeLazyBuilder::class . '::buildTime', ['H:i']],
    '#create_placeholder' => TRUE,
  ];
}
```

The callback class:

```php
final class TimeLazyBuilder implements TrustedCallbackInterface {

  public static function buildTime(string $format): array {
    return [
      '#markup' => date($format),
      '#cache' => ['max-age' => 0, 'contexts' => ['timezone']],
    ];
  }

  public static function trustedCallbacks(): array {
    return ['buildTime'];
  }
}
```

Both forms are accepted: a **static method** on a `TrustedCallbackInterface` class (above), or a **service callable** (`my_module.lazy_time:buildTime` referring to a service id). In both cases the class must implement `TrustedCallbackInterface` and list the method in `trustedCallbacks()`.

**Hard rules** `[fatto]`:

- Lazy builder array allows ONLY these keys: `#lazy_builder`, `#create_placeholder`, `#lazy_builder_preview`, `#cache`, `#weight`. Any other key turns it into a normal element and the lazy mechanism is lost.
- Arguments must be **scalar** — no entities, no objects. Pass an ID and load inside.

## TrustedCallbackInterface — mandatory for render callbacks

Any class providing `#pre_render`, `#post_render`, `#lazy_builder`, or `#access_callback` MUST implement `TrustedCallbackInterface` and declare its callbacks in `trustedCallbacks()`. The render system rejects untrusted callbacks; this is enforcement post SA-CORE-2018-002/004.

## Auto-placeholder conditions

Drupal automatically wraps an element in a placeholder (handed off to BigPipe / single-flush) when its cacheability metadata matches `core.services.yml > placeholder_strategy.conditions`:

- `max-age: 0`
- contexts containing `session` or `user` (but not `user.roles` alone)

This is why a per-user block with `'contexts' => ['user']` becomes a placeholder under BigPipe even if you never asked for it explicitly. You can opt **out** of caching and placeholdering for a block via `CacheOptionalInterface` `[since 11.3]`.

## Cache layers (top to bottom)

| Layer | Audience | Key | Notes |
|---|---|---|---|
| `page_cache` (Internal Page Cache) | anonymous only | URL | Built-in; respects `Cache-Control` and reverse-proxy headers. |
| `dynamic_page_cache` | everyone | URL × all contexts | Stores response *with placeholders unresolved*; resolves them per request. |
| `cache.render` | per-element | `#cache.keys` × contexts | Per-element render cache. Database-backed by default — point at Redis under load. |
| BigPipe | authenticated | streams placeholders | `[since 11.3]` HTMX-based; ~60-71% smaller JS payload than the pre-11.3 jQuery-based version. |
| Reverse proxy / CDN | edge | URL + headers | Integrate via `[contrib]` `purge` + purgers; emit `Surrogate-Key` / `Cache-Tag`. |

## Cache backends

`[core]`: `database` (default), `memory`, `null`, `php`, `chainedfast`, `apcu`.
`[contrib]`: `redis`, `memcache`.

Production-ready Redis configuration in `settings.php`:

```php
$settings['redis.connection']['interface'] = 'PhpRedis';
$settings['redis.connection']['host']      = '127.0.0.1';
$settings['cache']['default'] = 'cache.backend.redis';
$settings['container_yamls'][] = 'modules/contrib/redis/example.services.yml';

// chainedfast = APCu in front of Redis for the high-read low-write bins
$settings['cache']['bins']['bootstrap'] = 'cache.backend.chainedfast';
$settings['cache']['bins']['discovery'] = 'cache.backend.chainedfast';
$settings['cache']['bins']['config']    = 'cache.backend.chainedfast';
```

## D11.3 performance highlights `[since 11.3] [fatto]`

- **PHP Fibers** for lazy entity loads — multiple entities load concurrently via async-style cooperation.
- **~31% fewer SQL queries** on cold cache, **~50%** on partially warm (Drupal-announced figures; independent measurements report 62%/47% on specific workloads).
- `ContentEntityStorageBase::loadRevision()` is now cached.
- **BigPipe HTMX** rewrite — `core/drupal.ajax` is no longer a dependency.
- `[since 11.2]` The `CachedStrategy` placeholder strategy renders placeholders already present in the render cache directly instead of streaming them, which reduces visible layout shift on placeholder swap.
- `CacheOptionalInterface` for blocks — opt out of caching and placeholdering when the block has no meaningful cacheability.
- Experimental MySQLi driver (foundation for parallel queries; still experimental in 11.4).

## D11.4 performance highlights `[since 11.4] [fatto]`

Figures from the 11.4.0 release announcement (<https://www.drupal.org/blog/drupal-11-4-0>):

- **About 1/3 of the database and cache lookups of 11.0 / 10.6** on a cold cache.
- **Entity field loading** reworked: roughly **half the database queries of 11.3** across a wide range of requests.
- **Entity listing queries** use fewer table joins → fewer slow queries (visible on JSON:API and Views listings).
- **Brotli**: with `ext-brotli` installed, aggregated CSS/JS are written as `.br` as well as `.gz` (typically 15-25% smaller than gzip). Apache: the core `.htaccess` serves them. **Nginx needs manual config**: in the locations of the aggregated files (`/sites/*/files/css/`, `/sites/*/files/js/`) enable `gzip_static on;` and `brotli_static on;` (the latter needs the third-party `ngx_brotli` module). These directives pick `.br` / `.gz` **only when the client's `Accept-Encoding` allows it**. Do not copy a `try_files $uri.br $uri.gz $uri` line (it appears in the change record): `try_files` ignores `Accept-Encoding` and would send Brotli to clients that cannot decode it — verify with `curl -H 'Accept-Encoding: gzip'`. The toggles moved from `system.performance` `css.gzip`/`js.gzip` to `css.compress`/`js.compress` (change record <https://www.drupal.org/node/3526344>).
- Recipes apply about twice as fast (batched extension install).

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| Missing cache **contexts** | Information disclosure: one user's data is cached and served to another. |
| Missing cache **tags** | Stale content lingers after the source entity changes. |
| Tags too broad (`node_list` for one bundle's listing) | Thundering invalidation — every node save invalidates the listing. Use `node_list:<bundle>`. |
| **Early rendering** — rendering to a string inside a controller/block/service | Metadata bubbled by sub-elements does not reach the response: per-user content can be cached as anonymous → information disclosure. `render()` with no render context throws `LogicException`. **Return render arrays** and let core render them. If you really need the string, run it inside `$renderer->executeInRenderContext($context = new RenderContext(), fn () => $renderer->render($build))`, then, if `!$context->isEmpty()`, `$context->pop()` the `BubbleableMetadata` and apply it (`->applyTo($build)` or `$response->addCacheableDependency(...)`). `renderInIsolation()` does **not** propagate metadata to the parent — use it only where the output leaves the page (emails, token values). |
| `loadByProperties()` for a public listing | No access check, no bound. Use EntityQuery with `accessCheck(TRUE)` and `range(0, N)` — see `drupal11-views-and-queries`. |
| `max-age: 0` at the page level | Kills page caches entirely. Almost always wrong — push the `max-age: 0` down into a `#lazy_builder` instead. |
| N+1 entity load in preprocess / access check | Each iteration hits the DB. Pre-load with `loadMultiple()` or bubble the load into the lazy builder. |
| Twig debug enabled in prod | Breaks render cache hits, breaks Views, breaks tests. Disable in `services.yml` (and never commit it true). |
| `cache_render` on the database under heavy traffic | Table grows unbounded; queries slow under contention. Move to Redis. |
| Double-declaring metadata in render array AND `getCacheContexts()`/`getCacheTags()` | Works, but the render array is the source of truth — extra overrides drift over time. Use overrides only when the block has metadata before `build()` runs. |
| Non-scalar args in `#lazy_builder` | Render system throws; entities must be passed by ID. |

## Quick reference

| Goal | Pattern |
|---|---|
| Per-user variation | `'contexts' => ['user']` (rarely `user.permissions`) |
| Per-role variation | `'contexts' => ['user.roles']` |
| Vary by query string param | `'contexts' => ['url.query_args:filter']` |
| Invalidate when entity changes | `'tags' => ['node:' . $nid]` |
| Invalidate when any node of bundle changes | `'tags' => ['node_list:' . $bundle]` |
| Invalidate manually | `Cache::invalidateTags(['myproject:dashboard'])` |
| Make a sub-tree uncacheable but keep parent cacheable | `#lazy_builder` + `#create_placeholder` |
| Diagnose what's cached | `drush p:status`, headers `X-Drupal-Cache`, `X-Drupal-Dynamic-Cache` |

## Cross-skill handoff

- Plugin scaffolding (`#[Block]`, services, DI) → `drupal11-module-development`
- Query-level cache tag granularity (`addTag('node_access')`, list tags) → `drupal11-views-and-queries`
- `cache.config` bin and warming after `cim` → `drupal11-config-management`
- Redis / Memcache deployment, `settings.php` discipline → `drupal11-devops-testing-security`
- Twig debug, SDC asset attachment cost, Olivero overrides → `drupal11-frontend-theming`

## Status at 11.4 and looking ahead

- `[fatto]` The MySQLi driver is **still experimental and hidden** in 11.4 (`lifecycle: experimental`): do not use it in production and do not write code that depends on parallel queries.
- The 11.4 gains come from fewer and cheaper queries (field loading, listing joins), not from a new public API: nothing to change in custom code beyond correct cache metadata.
- `[forward-looking 12.x]` Parallel/async queries on MySQLi and wider Fiber use in core paths remain on the roadmap. Validate against change records before relying on either.
