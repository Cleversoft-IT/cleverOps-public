---
name: drupal11-module-development
description: Use when writing or modifying custom Drupal 11 module code under modules/custom/ — services, dependency injection, plugins, hooks, controllers, forms, entity types. Use when converting procedural hooks to OOP, replacing deprecated APIs (drupal_get_path, file_create_url, entity_load, drupal_render, drupal_set_message), converting annotation plugins to attributes, scaffolding a new D11 module with drush generate / drush field:create, or running phpcs (Drupal + DrupalPractice) before a commit. Drupal 11 specific — not for D9 or D10.
---

# Drupal 11 Module Development

## Overview

Custom Drupal 11 modules are written around three patterns: **OOP hooks via `#[Hook]` attribute** (since 11.1, themes since 11.3), **plugins via PHP attributes** (annotations are deprecated, removal in D13), and **constructor property promotion + `readonly` services** wired through Symfony DI. Baseline targeted: **11.4.x** (PHP 8.3+, 8.4 recommended; Symfony 7.4; Drush 13).

Procedural hooks in `.module` files and annotation plugins still parse, but they are the wrong choice for new code.

## When to use

- Editing files under `modules/custom/<name>/`: `*.info.yml`, `*.services.yml`, `*.routing.yml`, `*.permissions.yml`, `*.libraries.yml`, anything under `src/Hook/`, `src/Plugin/`, `src/Controller/`, `src/Form/`, `src/Entity/`, `src/EventSubscriber/`, `src/Access/`
- Converting legacy procedural hooks to OOP
- Replacing deprecated Drupal APIs
- Scaffolding a module, plugin, form or field from the CLI → `references/scaffolding-and-quality.md`

**When NOT to use:**
- Pure query/Views work → `drupal11-views-and-queries`
- Pure Twig/SDC theming → `drupal11-frontend-theming`
- `drush deploy`, `hook_update_N` / `hook_post_update_NAME` / `hook_deploy_NAME` → `drupal11-devops-testing-security`
- Cache tags/contexts for render output → `drupal11-performance-caching`
- Migrations, CSV/JSON imports, custom migrate source/process plugins → `drupal11-migrate`

## Before writing custom code

`[regola]` **Search for a contrib module first.** A maintained contrib module covered by the security team beats custom code you will have to maintain. Check drupal.org for D11 compatibility, security coverage, recent releases and usage; prefer extending or patching an existing module, or applying a recipe, over a new custom module. Then **read two or three analogous implementations** (the project's custom modules first, then core/contrib) and follow their conventions, and **scaffold with Drush generators** instead of hand-writing boilerplate. Details, test data, the non-interactive `drush generate` syntax, `drush field:create`, and the pre-commit checklist (phpcs + security self-review): `references/scaffolding-and-quality.md`.

## The single most important rule

**Default to `#[Hook]` OOP, not procedural hooks in `.module`.**

Since 11.1, hooks are PHP methods on classes in `src/Hook/`. Theme hooks gained the same support in 11.3, and in 11.4 the hooks of every core theme moved to classes. Procedural hooks still work but are legacy — every new hook in a new file should be OOP. There is no warning when you regress; the code runs and the project drifts away from the 11.x baseline.

### Pattern

`modules/custom/my_module/src/Hook/FormHooks.php`:

```php
<?php

declare(strict_types=1);

namespace Drupal\my_module\Hook;

use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\StringTranslation\TranslatableMarkup;

final class FormHooks {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {}

  #[Hook('form_node_article_form_alter')]
  public function articleFormAlter(array &$form, FormStateInterface $form_state, string $form_id): void {
    $form['#validate'][] = [self::class, 'rejectSpamTitle'];
  }

  public static function rejectSpamTitle(array &$form, FormStateInterface $form_state): void {
    $title = (string) $form_state->getValue(['title', 0, 'value']);
    if (stripos($title, 'spam') !== FALSE) {
      $form_state->setErrorByName('title', new TranslatableMarkup('Title may not contain "spam".'));
    }
  }
}
```

That is the whole pattern: a class in `src/Hook/`, methods carrying `#[Hook('name')]`. `[fatto]` Classes in the module's `Hook` namespace are **registered automatically as autowired services** — no `*.services.yml` entry and no `.module` file are required. Declare the class in `*.services.yml` only if you need non-autowirable arguments.

Hooks that **cannot** be OOP (keep them procedural, in `.install` / `.module`): `hook_install`, `hook_uninstall`, `hook_schema`, `hook_update_N`, `hook_post_update_NAME`, `hook_requirements` (being split into `hook_runtime_requirements` / `hook_update_requirements`), `hook_hook_info`, `hook_module_implements_alter`.

### Skip the legacy scan

Once every hook of the module is converted (the `.module` file keeps only `#[LegacyHook]` shims or plain helpers), opt the module out of the procedural scan for a faster hook discovery:

```yaml
# my_module.services.yml
parameters:
  my_module.skip_procedural_hook_scan: true
```

`[since 11.2]` Parameter name is `<module>.skip_procedural_hook_scan`. The 11.1 spelling `hook_converted` and the contrib lore `hooks_converted: true` are wrong — using them silently does nothing. Do not set it if the module still implements `hook_hook_info()` or other procedural-only hooks in `.module`: they would stop firing. For a per-file cut-off use the `#[ProceduralHookScanStop]` attribute. For dual D10/D11 backcompat use `#[LegacyHook]` on the procedural shim that forwards to the OOP method.

## Plugins use PHP attributes

```php
#[Block(
  id: 'my_module_greeting',
  admin_label: new TranslatableMarkup('Greeting Block'),
  category: new TranslatableMarkup('My Module'),
)]
final class GreetingBlock extends BlockBase { /* ... */ }
```

Annotation syntax (`@Block(id = "...")`) still parses but is **scheduled for removal in Drupal 13**. Do not introduce new annotation plugins; when you touch an existing one, convert it: same keys, attribute class from the plugin type's `Attribute` namespace, translatable strings as `new TranslatableMarkup(...)`. The same applies to entity types: `#[ContentEntityType(...)]` and `#[ConfigEntityType(...)]`.

### Plugin DI: autowired `create()` `[since 11.3]`

```php
use Drupal\Core\Plugin\ContainerFactoryPluginInterface;
use Drupal\Core\Session\AccountInterface;

#[Block(id: 'my_module_greeting', admin_label: new TranslatableMarkup('Greeting'))]
final class GreetingBlock extends BlockBase implements ContainerFactoryPluginInterface {

  public function __construct(
    array $configuration,
    string $plugin_id,
    array $plugin_definition,
    private readonly AccountInterface $currentUser,
  ) {
    parent::__construct($configuration, $plugin_id, $plugin_definition);
  }

  public function build(): array {
    return [
      '#markup' => $this->t('Hello, @name', ['@name' => $this->currentUser->getDisplayName()]),
      '#cache' => ['contexts' => ['user']],
    ];
  }
}
```

`[fatto]` Since 11.3 `Drupal\Core\Plugin\PluginBase` uses `Drupal\Core\DependencyInjection\AutowiredInstanceTrait` and ships a generic `create()`: a plugin that implements `ContainerFactoryPluginInterface` gets its constructor arguments autowired, **no `create()` and no extra trait needed**. When a service cannot be inferred from the type (several services share the interface), add `#[Autowire(service: 'entity_type.manager')]` on the parameter. Pre-11.3 modules write `create()` by hand:

```php
public static function create(ContainerInterface $container, array $configuration, $plugin_id, $plugin_definition): self {
  return new self($configuration, $plugin_id, $plugin_definition, $container->get('current_user'));
}
```

`AutowireTrait` is the equivalent for `ContainerInjectionInterface` classes — controllers, forms, access checkers. `ControllerBase` uses it since 10.2; **`FormBase` uses it only since 11.4** — on 11.3 and earlier add `use AutowireTrait;` to the form explicitly.

`[since 11.4]` Both traits also resolve **container parameters**: `#[Autowire(param: 'my_module.limit')]` (or `#[Autowire('%my_module.limit%')]`) on a constructor argument, and setter injection on public methods marked `#[Required]`.

## Routes and bundle classes via attributes `[since 11.4]`

- Controllers in the module's `Controller` namespace can declare routes with `Symfony\Component\Routing\Attribute\Route` (`path`, `name`, `requirements`, `defaults` with `new TranslatableMarkup(...)` titles). It supplements `*.routing.yml`, which stays valid and is still needed on 11.3.
- Bundle classes can be declared with `#[Drupal\Core\Entity\Attribute\Bundle(entityType: ..., bundle: ...)]` in the module's `Entity` namespace (e.g. `entityType: 'node', bundle: 'article'` on a class extending `Node`), instead of `hook_entity_bundle_info_alter()`. For entity types with a bundle config entity (node/`node_type`, taxonomy/`vocabulary`, …) the bundle must already exist: the attribute assigns a class to an existing bundle but cannot create a missing configurable bundle.

## Deprecated → modern API

| Deprecated (do not use in new code) | Modern Drupal 11 |
|---|---|
| `drupal_get_path('module', 'foo')` | `\Drupal::service('extension.list.module')->getPath('foo')` |
| `file_create_url($uri)` | `\Drupal::service('file_url_generator')->generateAbsoluteString($uri)` |
| `entity_load($type, $id)` / `entity_create()` | `$this->entityTypeManager->getStorage($type)->load($id)` |
| `drupal_render($build)` | Return the render array. If a string is unavoidable: `$renderer->renderInIsolation($build)` only for output leaving the page (mail, tokens — metadata is not bubbled), otherwise render inside `executeInRenderContext()` and apply the collected metadata (see `drupal11-performance-caching`) |
| `drupal_set_message($msg)` | `\Drupal::messenger()->addStatus($msg)` |
| `format_date($ts)` | `\Drupal::service('date.formatter')->format($ts)` |
| Annotation plugin (`@Block(id = "...")`) | Attribute plugin (`#[Block(id: '...')]`) |
| `hook_requirements()` | `hook_runtime_requirements()` + `hook_update_requirements()` + `InstallRequirementsInterface` |
| Procedural callback in render array | Class implementing `TrustedCallbackInterface` |
| Procedural hooks in `.module` | `#[Hook]` methods in `src/Hook/` |
| `db_query('...')` | `$this->database->query('...', [':p' => ...])` |
| `php core/scripts/drupal ...` | `vendor/bin/dr ...` `[since 11.4]` (old script is a deprecated shim, removed in D13) |

When refactoring legacy helpers, **prefer extracting to a service** with constructor DI rather than wrapping calls in `\Drupal::service(...)` static facades — facades work but ruin testability.

## TrustedCallbackInterface is mandatory

Any class providing `#pre_render`, `#post_render`, `#lazy_builder`, or `#access_callback` MUST implement `TrustedCallbackInterface` and declare its callbacks via `trustedCallbacks()`. The render system rejects untrusted callbacks (enforcement post SA-CORE-2018-002/004). Lazy builder args must be scalar; the callback is either a static method (`MyBuilder::class . '::build'`) or a service callable (`'my_module.lazy_builder:build'`), and in both cases the class implements `TrustedCallbackInterface`.

## Modules removed or relocated

Some answers default to coding against modules that no longer exist or were moved:

- **Moved to contrib in D11.0:** Actions UI, Aggregator, Book, Forum, Statistics, Tour, Tracker, HAL, RDF.
- **Removed from core in D10 (contrib only):** QuickEdit, Color, base themes Classy / Stable / Bartik / Seven.
- **Folded into core subsystems in D10:** SDC (the experimental `sdc` module was merged into core in 10.3 and is **obsolete** in D11 — do not enable it), Help Topics (merged into Help).
- **Deprecated in D11, removed from core in D12:** Ban, Field Layout, Migrate Drupal UI (deprecated by 11.3); Contact, History, Migrate Drupal and the **Stable 9** base theme (deprecated in 11.4).

`base theme: classy` or `base theme: stable` needs the contrib project on D11; `base theme: stable9` still works on D11 but the core copy is deprecated since 11.4 (a contrib `stable9` exists for D12) — prefer regenerating the theme via Starterkit. Contact, History and Ban also continue as contrib projects; Migrate Drupal / Migrate Drupal UI do not (see `drupal11-migrate`).

## Pitfalls

| Pitfall | Why it bites |
|---|---|
| Non-plugin class under `src/Plugin/<Type>/` | Plugin discovery scans the directory and tries to instantiate it → fatal at cache rebuild. |
| Custom service in `services.yml` without FQCN id | Autowire by interface alone cannot resolve concrete classes. Use the FQCN as the service id, or alias it. |
| Bundle classes injecting services via constructor | Bundle classes are instantiated outside the container — constructor DI does not work. Use `\Drupal::service(...)` or keep them thin. |
| Wrong skip-scan parameter (`hooks_converted: true`) | Correct name is `<module>.skip_procedural_hook_scan` `[since 11.2]`. The wrong name silently does nothing. |
| `FormBase` subclass on ≤ 11.3 without `AutowireTrait` | Before 11.4 `FormBase` does not pull it in: without `use AutowireTrait;` (or a hand-written `create()`) constructor arguments are not injected. |
| Hand-written `create()` plus autowiring attributes on a plugin | Your `create()` overrides the autowired one from `PluginBase` and the `#[Autowire]` attributes are ignored. Keep one mechanism. |
| String callback in `#pre_render` / `#lazy_builder` | Render system rejects without `TrustedCallbackInterface`. Move the callback to the class and register via `trustedCallbacks()`. |
| Custom code for a solved problem | A maintained contrib module gets security coverage and upgrades for free. Search first (see above). |

## Quick reference

| Task | File / pattern |
|---|---|
| Scaffold | `drush generate <generator> --answer=... --dry-run` — see `references/scaffolding-and-quality.md` |
| New hook | `src/Hook/<Concern>Hooks.php` with `#[Hook('name')]` methods (auto-registered) |
| New plugin | `src/Plugin/<Type>/<Name>.php`, `#[<Type>(...)]` attribute, implement `ContainerFactoryPluginInterface` (autowired `create()` from 11.3) |
| New controller | `src/Controller/<Name>.php` extends `ControllerBase` (autowired); route in `*.routing.yml` or `#[Route]` (11.4+) |
| New form | `src/Form/<Name>.php` extends `FormBase` (autowired from 11.4; `use AutowireTrait;` on 11.3) |
| New service | declare in `*.services.yml` with `autowire: true`; class in `src/` |
| New entity type | `src/Entity/<Name>.php` with `#[ContentEntityType(...)]` or `#[ConfigEntityType(...)]` |
| New field on a bundle | `drush field:create <entity_type> <bundle> --field-name=... --field-type=...` then `drush cex` |
| Render callback | class implements `TrustedCallbackInterface` + `trustedCallbacks()` |
| Before committing | `vendor/bin/phpcs --standard=Drupal,DrupalPractice ...` + phpstan + tests (checklist in the reference) |

## Cross-skill handoff

- Cache metadata for plugin output → `drupal11-performance-caching`
- EntityQuery / Views / query alter → `drupal11-views-and-queries`
- `hook_update_N` / `hook_post_update_NAME` / `hook_deploy_NAME`, PHPUnit → `drupal11-devops-testing-security`
- Render arrays consumed by Twig / SDC → `drupal11-frontend-theming`
- Config schema for entity types, `drush cex` after `field:create` → `drupal11-config-management`
- Migrate source/process plugins → `drupal11-migrate`

## Looking ahead

`[forward-looking 12.x]` Drupal 12 (planned for December 2026, alongside 11.5) removes the modules deprecated above and, on its development branch, requires PHP 8.5 and Symfony 8. Validate against the D12 release notes before relying on either.
