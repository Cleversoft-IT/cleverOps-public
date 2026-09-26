---
name: drupal11-frontend-theming
description: Use when working on Drupal 11 frontend — Twig 3 templates, Single Directory Components (SDC), custom themes generated via Starterkit, *.info.yml / *.libraries.yml, libraries-override and libraries-extend, preprocess hooks, Olivero / Claro / Stark, jQuery removal (core/once, native dialog). Use when deciding between Layout Builder, Paragraphs, and Blocks. Use when symptoms involve InvalidCssDefinitionException, missing assets, or stale Twig output.
---

# Drupal 11 Frontend Theming

## Overview

Drupal 11 standardized on **Twig 3 with global `html` autoescape**, **SDC (Single Directory Components) inside core**, and **Starterkit as a generator** (no runtime base theme). The base themes most people remember from D7/D8/D9 — Classy, Stable, Bartik, Seven — were **removed from core in D10** (contrib only). **Stable 9** still ships with D11 but is **deprecated since 11.4** and leaves core in D12. Olivero is the default frontend theme, Claro the default admin theme, Stark the testing theme. jQuery is no longer a hard dependency: `core/once` replaces `jquery.once`, native `<dialog>` replaces jQuery UI. Baseline: **11.4.x**.

`[since 11.3]` Themes can implement OOP hooks via `#[Hook]` just like modules. `[since 11.4]` the hooks of every core theme moved from `.theme` files to hook classes — follow the same layout in custom themes.

## When to use

- Authoring Twig templates, SDC components, libraries
- Generating a new theme via Starterkit
- Overriding or extending another theme's libraries
- Wiring preprocess hooks (procedural or `#[Hook]` OOP since 11.3)
- Choosing between Layout Builder, Paragraphs, and Blocks for editorial layouts
- Diagnosing `InvalidCssDefinitionException`, missing CSS/JS, stale rendered HTML

**When NOT to use:**
- Pure render array / cacheability question → `drupal11-performance-caching`
- Plugin / hook / service scaffolding patterns → `drupal11-module-development`
- Views display & cache plugin internals → `drupal11-views-and-queries`
- Recipe-shipped theme config → `drupal11-config-management`

## Two facts that change defaults

1. **SDC is in core.** The experimental core module `sdc` was merged into the theme system in 10.3 and is **obsolete** in D11. **Do not enable `sdc` as a module** (nor look for a contrib one); SDC is always available.
2. **Classy / Stable / Bartik / Seven are gone from core since D10.** `base theme: classy` or `stable` only works with the contrib project installed. `base theme: stable9` still works on D11 but is deprecated since 11.4 (contrib `stable9` covers D12). If you are upgrading an old theme, regenerate via Starterkit.

## SDC — Single Directory Components

A component is a folder under `<module-or-theme>/components/<name>/`:

```
my_provider/
└── components/
    └── card/
        ├── card.component.yml      # JSON-schema-validated metadata
        ├── card.twig
        ├── card.css                # auto-attached when card renders
        ├── card.js                 # auto-attached
        └── thumbnail.png           # optional, shown in design tools
```

Component ID is `<provider>:<component>` — e.g. `my_provider:card`. Drupal validates passed props against the JSON schema and throws `InvalidComponentDataException` on mismatch — **only when PHP assertions are enabled** (`zend.assertions=1`, typical of development). In production invalid props render silently, so exercise components with assertions on (local, CI).

`card.component.yml`:

```yaml
$schema: https://git.drupalcode.org/project/drupal/-/raw/HEAD/core/assets/schemas/v1/metadata.schema.json
name: Card
status: stable
description: Reusable card with image, title, body and optional CTA.

props:
  type: object
  required: [title]
  properties:
    title:
      type: string
    body:
      type: string
    image_src:
      type: string
      format: uri-reference
    image_alt:
      type: string
      default: ''
    variant:
      type: string
      enum: [default, compact, featured]
      default: default

slots:
  footer:
    title: Footer
    description: Optional footer slot.
```

Use from any Twig:

```twig
{# Props only #}
{{ include('my_provider:card', {
  title: node.label,
  body: content.body|render|striptags,
  image_src: file_url(node.field_image.entity.uri.value),
  image_alt: node.field_image.alt,
  variant: 'featured',
}, with_context = false) }}

{# With slot — use embed #}
{% embed 'my_provider:card' with { title: 'Hello' } %}
  {% block slot_footer %}<small>{{ 'Updated today'|t }}</small>{% endblock %}
{% endembed %}
```

### Critical SDC limitations and trade-offs

- **SDC bypasses preprocess and theme hooks.** Other modules cannot alter a component's render via `hook_preprocess_*` or `theme()`. This is by design — components are atomic — but it means you must own the contract: anything that needs to vary should be a prop or a slot.
- **Replacement is metadata-driven.** If you need to swap a component shipped by another module/theme, declare `replaces: original_provider:original_component` in your component's metadata. There is no preprocess-based override path.
- **Performance gain:** assets auto-attach **only when the component renders**. A `card.css` next to `card.component.yml` does not load on pages that never render a card.

### When SDC vs traditional template `[trade-off]`

- **SDC**: reusable atom/molecule with documented and validated input, asset on-demand, integrates with Storybook / design systems. Choose for shared UI primitives.
- **Traditional template** (`node--article.html.twig`, `block--system-branding-block.html.twig`): output is driven by Drupal hooks, extensibility matters via preprocess. Choose when other modules need to alter what you render.

## Theme generation — Starterkit

Starterkit is a **generator**, not a runtime base theme. Run from the Drupal root:

```bash
# [since 11.4] experimental core CLI
vendor/bin/dr generate-theme myproject_theme \
  --name="MyProject Theme" \
  --description="Custom theme for myproject." \
  --path=themes/custom
# 11.3 and earlier (deprecated shim in 11.4, removed in D13):
php core/scripts/drupal generate-theme myproject_theme --name="MyProject Theme" --path=themes/custom
```

`--starterkit=<theme>` generates from another starterkit-enabled theme instead of the default `starterkit_theme`.

`[since 10.3]` Starterkit reads `<theme>.starterkit.yml` (in the theme being generated *from*) for `ignore` / `no_edit` / `no_rename` glob patterns — this replaces the older `StarterKitInterface` PHP API. Useful when you fork your own theme to spin off variants.

Minimum `myproject_theme.info.yml`:

```yaml
name: MyProject Theme
type: theme
description: Custom front-end theme for MyProject.
package: Custom
core_version_requirement: ^11
base theme: false      # explicit "no base theme" — Starterkit default

libraries:
  - myproject_theme/global

regions:
  header: Header
  primary_menu: Primary menu
  highlighted: Highlighted
  content: Content
  sidebar: Sidebar
  footer_top: Footer top
  footer_bottom: Footer bottom
  breadcrumb: Breadcrumb
```

`base theme: false` is the canonical no-base declaration. For a theme that should inherit Olivero/Claro markup and override selectively, set `base theme: olivero` (or `claro`).

## Libraries

Libraries are declared in `<theme-or-module>.libraries.yml`. CSS is bucketed by **SMACSS** category — declaring CSS without a valid category throws `InvalidCssDefinitionException` at discovery.

Valid CSS categories, in load order:

1. `base` — element selectors, resets
2. `layout` — page-level structural CSS
3. `component` — UI components (cards, buttons, …)
4. `state` — UI states (`is-open`, `is-active`)
5. `theme` — visual decoration only

```yaml
global:
  version: 1.x
  css:
    component:
      css/components/card.css: {}
  js:
    js/myproject.js: {}
  dependencies:
    - core/drupal
    - core/once
```

JS properties: `defer`, `async`, `preprocess: false` (skip aggregation), `minified: true`, `weight`, `attributes`. Common dependencies: `core/drupal`, `core/drupalSettings`, `core/once`, `core/jquery` (only if you genuinely need jQuery — usually you do not).

**Module CSS always loads before theme CSS regardless of SMACSS category.** Cross-module ordering is via library `dependencies:`, not category.

### `libraries-override` and `libraries-extend`

Override a single asset shipped by another theme/module from your `*.info.yml`:

```yaml
libraries-override:
  olivero/navigation:
    css:
      component:
        css/components/navigation/navigation.css: css/overrides/olivero-navigation.css
```

- `olivero/navigation` is `<provider>/<library_name>` taken verbatim from `core/themes/olivero/olivero.libraries.yml`.
- Left-hand path is the original asset path, exactly as Olivero declares it.
- Right-hand path is relative to your theme root.
- Set the value to `false` to remove the asset entirely. Set the whole library entry to `false` to remove the library.

`libraries-extend` adds assets to an existing library without redeclaring it — handy for appending an override stylesheet to `core/drupal.dialog`, etc.

## Twig essentials

**Functions/filters worth knowing:** `path()`, `url()`, `link()`, `file_url()`, `attach_library()`, `active_theme()`, `create_attribute()`. Filters: `|t`, `|trans`, `|placeholder`, `|safe_join`, `|without('field_x')`, `|clean_class`, `|format_date`, `|render`, `|e`.

`[since 11.4]` Core bundles `twig/html-extra`: `html_classes()`, `html_attr()` and `html_cva()` (class-variant helper, handy for SDC variants) are available in every template.

**`|raw` is dangerous.** Drupal's autoescape is on by default; bypassing it with `|raw` opens XSS. Never apply it to user-derived values. Let Twig escape plain values, and sanitize rich text **upstream**: `#plain_text` for text, a `processed_text` element (text format) for user HTML, `Xss::filter()` / `Xss::filterAdmin()` when you must filter a string. `Markup::create()` does not sanitize anything — it only marks a string as safe, so use it only for markup you built or verified yourself. More in `drupal11-devops-testing-security` (`references/secure-coding.md`).

**Twig debug must be OFF in production.** It rewrites every render with HTML comments listing template suggestions — that **breaks render caching** (cached output diverges per request), trips Views integration tests, and balloons response sizes. Set in `services.yml`:

```yaml
parameters:
  twig.config:
    debug: false      # true only in development
    auto_reload: false
    cache: true
```

## Theme OOP hooks `[since 11.3]`

Themes can now declare hooks the same way modules do — methods on `src/Hook/<Class>.php` annotated with `#[Hook('...')]`. The plumbing (classes in the `Hook` namespace auto-registered as autowired services, `<theme>.skip_procedural_hook_scan` parameter to opt out of legacy scan) is identical to module hooks. See `drupal11-module-development` for the full pattern. `[since 11.4]` Core themes (Olivero, Claro, …) implement their hooks in `src/Hook/` classes (the `.theme` file keeps only helpers): look there for the preprocess you want to override.

```php
// themes/custom/myproject_theme/src/Hook/PreprocessHooks.php
#[Hook('preprocess_node')]
public function preprocessNode(array &$variables): void {
  // ...
}
```

## Layout Builder vs Paragraphs vs Blocks `[trade-off]`

| Aspect | Plain Blocks `[core]` | Paragraphs `[contrib]` | Layout Builder `[core]` |
|---|---|---|---|
| Editor UX | admin Block Layout (rigid regions) | structured field widget | drag-and-drop in-page |
| Reusability | high (placed once, served everywhere) | low (host-owned, unless `paragraphs_library`) | medium (block content reusable) |
| Design coherence | strong | strong (typed bundles) | weak (per-entity freedom) |
| Performance | best | good | heaviest |
| Translation | good | excellent | historically weak; improving with `layout_builder_at` `[contrib]` for asymmetric layouts |
| Best for | site chrome (header, footer, sidebar) | structured repeated content | landing pages, per-entity overrides |

Common production pattern: **Paragraphs for repeated content + Layout Builder only for layout defaults (overrides disabled)** — preserves structure while still allowing template authors to compose pages.

For a "marketing drops hero/feature/testimonial in any order with translations" use case: **Layout Builder + reusable custom Block content types** is the canonical pick. Choose Paragraphs only if asymmetric translation with minimal contrib surface is non-negotiable today.

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| Trying to alter SDC output via `hook_preprocess_*` | SDC bypasses preprocess. Component-level changes must be props, slots, or `replaces:` in the metadata. |
| `base theme: classy` / `base theme: stable` on D11 | Removed from core in D10: the theme fails to install unless the contrib project is present. Regenerate via Starterkit. |
| New theme on `base theme: stable9` | Works on D11 but deprecated since 11.4 and gone from core in D12. Use Starterkit (`base theme: false`) or Olivero/Claro. |
| Enabling the `sdc` module on D11 | SDC is in core since 10.3; the old experimental module is obsolete. |
| Trusting SDC prop validation in production | Validation runs only with PHP assertions enabled; test components with assertions on. |
| `\|raw` on user-derived input | Bypasses autoescape → XSS. Let Twig escape, or sanitize upstream (`#plain_text`, `processed_text`, `Xss::filter()`). Never wrap input in `Markup::create()`: it marks it safe without filtering. |
| Twig debug `true` in production | Breaks render cache (output diverges per request), breaks Views integration tests. |
| Loading entities in Twig (`{{ node.field_x.entity.field_y }}`) | Triggers N+1 lazy load per render. Pre-load in preprocess and pass simple values to the template. |
| Wrong SMACSS category in `libraries.yml` | `InvalidCssDefinitionException` at discovery. Allowed values are exactly `base`, `layout`, `component`, `state`, `theme`. |
| `core/jquery.once` dependency | Removed. Replace with `core/once` (vanilla `@drupal/once` API). |
| jQuery UI dialog | Removed. Use the native `<dialog>` element + `core/once` for behavior wiring. |
| Forgetting to `attach_library()` for a Twig-driven asset | Library never loads. Either include it in the page-level library or call `{{ attach_library('myproject_theme/global') }}` in the relevant template. |
| Editing CSS/JS without rebuilding cache when aggregation is on | Browser sees stale aggregated bundle. `drush cr` or disable aggregation in dev. |

## Quick reference

| Task | Pattern |
|---|---|
| New SDC component | folder under `components/<name>/` with `*.component.yml` + `*.twig` (+ optional `*.css`/`*.js`) |
| Include a component in Twig | `{{ include('<provider>:<name>', {...}, with_context = false) }}` (or `embed` for slots) |
| Replace another component | `replaces: other_provider:other_component` in your `*.component.yml` |
| Generate a theme | `vendor/bin/dr generate-theme <name> --path=themes/custom` (11.4+; `php core/scripts/drupal generate-theme` before) |
| Override an asset of another theme | `libraries-override:` block in `*.info.yml` |
| Append assets without redeclaring | `libraries-extend:` block in `*.info.yml` |
| Theme preprocess hook (OOP) | `src/Hook/<Class>.php` method with `#[Hook('preprocess_*')]` (since 11.3) |
| Force-load a library from Twig | `{{ attach_library('<theme>/<library>') }}` |

## Cross-skill handoff

- Render arrays consumed by Twig and cacheability metadata bubbling → `drupal11-performance-caching`
- `#[Hook]` mechanics, `*.services.yml` wiring → `drupal11-module-development`
- Views display / row / style template overrides → `drupal11-views-and-queries`
- Recipe-shipped theme + libraries → `drupal11-config-management`
- Asset aggregation in production, Twig debug discipline at deploy time → `drupal11-devops-testing-security`

## Status at 11.4 and looking ahead

- `[fatto]` OOP hooks in core themes: done in 11.4 (core theme hooks converted to classes).
- `[since 11.4]` The Standard profile installs **Navigation** instead of Toolbar; **Default Admin** (Gin, with dark mode) is in core as an experimental admin theme — Claro stays the default. Admin-theme CSS overrides written for Claro do not carry over to Default Admin.
- `[forward-looking 12.x]` Richer SDC validation (slot constraints, prop dependencies) is not in the 11.4 release notes. Keep contracts in props/slots and validate against change records before relying on it.
