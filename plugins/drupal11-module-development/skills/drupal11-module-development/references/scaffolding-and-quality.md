# Scaffolding and quality gates for Drupal 11 modules

Companion to `../SKILL.md`. Baseline: Drupal 11.4, **Drush 13** (13.8 at the time of writing; Drush 14 is not released yet), Coder 8.3 / 9.

## 1. Contrib first `[regola]`

Before generating a custom module, check whether the problem is already solved:

1. Search [drupal.org/project/project_module](https://www.drupal.org/project/project_module) filtered by Drupal 11 compatibility.
2. On the project page check: **security advisory coverage** (the shield), a stable release for D11, recent commits/releases, reported installs, and the issue queue response time.
3. Prefer, in order: site building with core (Views, fields, workflows, recipes) → an existing contrib module (or a recipe that bundles it) → a patch to that module (`cweagans/composer-patches`) → a small custom module that extends it → a new custom module.
4. Install contrib with Composer, never by copying code: `composer require drupal/<project>` then `drush en <module>` (or `drush recipe <path>` for a recipe) and `drush cex`.

Ask the developer before writing custom code if a maintained contrib module covers most of the need; record the decision (and the modules you rejected, with the reason) in the module README or the PR.

## 2. Read before you generate `[regola]`

Before generating or writing code, read **two or three existing implementations of the same kind** — in the project's own custom modules first (naming, service ids, folder layout, test style), then in core or a well-maintained contrib module (e.g. an existing `#[Block]` plugin, a `ConfigFormBase` form, a `src/Hook/` class). Match their conventions; note in the PR which examples you followed. Also check what the project already has (e.g. `rg -n "#\[Block" web/modules/custom`) so you extend instead of duplicating.

**Test data**: build fixtures in code, never from production dumps. In Kernel/Functional tests create entities with the entity API or the traits core ships (`NodeCreationTrait`, `UserCreationTrait`, `ContentTypeCreationTrait`, `TaxonomyTestTrait`); for manual testing use `devel_generate` `[contrib]` or a recipe with default content. Keep personal data, real emails and secrets out of fixtures, recipes and exported config.

## 3. `drush generate` — scaffolding without prompts

`[fatto]` Signature: `drush generate [generator]` (alias `gen`). Options: `--answer=ANSWER` (repeatable), `--dry-run`, `--destination=PATH`, `--working-dir=PATH`, `--replace`. Source: <https://www.drush.org/13.x/commands/generate/>.

Things that commonly go wrong:

- **There is no JSON `--answers` option in Drush 13**, and **no `-a` short form** — only `--answer`, repeated.
- Answers are consumed **strictly in the order of the questions**; each is validated like typed input. When the answers run out, the generator falls back to an interactive prompt (or aborts without a TTY). Supply one `--answer` per question.
- `-y` / `--yes` does **not** mean "accept all defaults" for generators: Drush maps it to `--replace`, i.e. overwrite existing files.
- The questions depend on the generator, on the context (inside an existing module some are skipped) and on the drupal-code-generator version in your lock file. **Always discover them first**: `drush generate <name> -vvv --dry-run`.
- Confirmation questions accept `yes` / `no`. Questions that loop (e.g. "Type the service name…" after "Would you like to inject dependencies?") end with an empty answer: `--answer=""`.

Workflow:

```bash
# 1. See the exact question sequence and the files it would write
drush generate module -vvv --dry-run

# 2. Re-run with one --answer per question, still as a dry run
drush generate module \
  --answer="Acme Events" \
  --answer=acme_events \
  --answer="Event listings for Acme." \
  --answer=Custom \
  --answer="" \
  --answer=no --answer=no --answer=yes \
  --destination=web/modules/custom --dry-run

# 3. Drop --dry-run once the output is right
```

For `module` (drupal-code-generator 4.x) the questions are, in order: name, machine name, description, package, dependencies (comma separated), create `.module` file?, create `.install` file?, create `README.md`?

Generator names (Drush 13, <https://www.drush.org/13.x/generators/all/>):

| Need | Generator (alias) |
|---|---|
| Module / theme | `module`, `theme`, `theme:settings` |
| Controller | `controller` |
| Forms | `form:simple` (`form`), `form:config` (`config-form`), `form:confirm` (`confirm-form`) |
| Block | `plugin:block` (`block`) |
| Service / event subscriber | `service:custom` (`custom-service`), `service:event-subscriber` (`event-subscriber`) |
| Other services | `service:access-checker`, `service:param-converter`, `service:route-subscriber`, `service:twig-extension`, … |
| Hook | `hook` |
| Drush command | `drush:command` |
| Entities | `entity:content` (`content-entity`), `entity:configuration` (`config-entity`), `entity:bundle-class` |
| Field plugins | `plugin:field:type`, `plugin:field:widget`, `plugin:field:formatter` |
| Other plugins | `plugin:queue-worker`, `plugin:views:field`, `plugin:condition`, `plugin:constraint`, `plugin:action`, `plugin:manager` |
| Migrate plugins | `plugin:migrate:source`, `plugin:migrate:process`, `plugin:migrate:destination`, `yml:migration` |
| SDC component | `single-directory-component` (`sdc`) |
| Tests | `test:unit`, `test:kernel`, `test:browser`, `test:webdriver`, `test:nightwatch` |
| YAML files | `yml:routing`, `yml:services`, `yml:permissions`, `yml:links:menu`, `yml:module-libraries`, … |

**Review generated code against `../SKILL.md` before committing.** Templates can lag behind the current core minor: convert any procedural hook to `#[Hook]`, any annotation to an attribute, and drop a generated `create()` on 11.3+ plugins (autowired `create()` from `PluginBase`) or 11.4+ forms (`FormBase` uses `AutowireTrait`).

In a container, prefix as usual: `ddev drush generate …`, `docker compose exec php drush generate …`.

## 4. Content types and fields from the CLI

**Content types.** Since 11.4 the Standard profile no longer creates *Article* and *Page*. Add them by applying the core recipes `core/recipes/article_content_type` or `core/recipes/page_content_type` (see `drupal11-config-management`); the recipe path is checked with `is_dir()` against the current working directory, so pass it relative to where you run the command or as an absolute path. For a custom bundle, create it once in the UI (or via a recipe / `config/install` YAML) and export it with `drush cex`.

**Fields** — `drush field:create [entityType] [bundle]` (aliases `field-create`, `fc`), <https://www.drush.org/13.x/commands/field_create/>. Options:
`--field-name`, `--field-label`, `--field-description`, `--field-type`, `--field-widget`, `--is-required`, `--is-translatable`, `--cardinality`, `--target-type`, `--target-bundle`, `--existing`, `--existing-field-name`, `--show-machine-names`.

```bash
# Plain text field
drush field:create node article -n \
  --field-name=field_subtitle --field-label="Subtitle" \
  --field-type=string --field-widget=string_textfield \
  --is-required=0 --cardinality=1

# Entity reference to taxonomy terms of one vocabulary, unlimited values
drush field:create node article -n \
  --field-name=field_tags --field-label="Tags" \
  --field-type=entity_reference --field-widget=entity_reference_autocomplete \
  --target-type=taxonomy_term --target-bundle=tags --cardinality=-1

# Reuse an existing field storage on another bundle
drush field:create node page -n --existing-field-name=field_subtitle --field-label="Subtitle"

# Always export afterwards
drush cex -y
```

Any option you omit is prompted for in an interactive shell. In scripts and agent runs add `--no-interaction` (`-n`): omitted optional options (description, widget, required, translatable) then fall back to defaults, and a missing required one (`--field-name`, `--field-label`, `--field-type`, `--cardinality`) fails instead of hanging. With `--existing-field-name` the storage (type, cardinality, target type) is reused, so only label and display options apply.

`field:create` adds the field to the **default form display** (with `--field-widget`) and the **default view display** (default formatter). There is no formatter option: adjust the view display in the UI or YAML, then `drush cex`.

Inspecting and deleting (<https://www.drush.org/13.x/commands/field_info/>, <https://www.drush.org/13.x/commands/field_delete/>):

| Goal | Command |
|---|---|
| Fields of a bundle | `drush field:info node article` (`fi`) |
| Available field types | `drush field:types` |
| Widgets / formatters for a type | `drush field:widgets --field-type=string`, `drush field:formatters --field-type=string` |
| Delete a field from a bundle | `drush field:delete node article --field-name=field_subtitle` (`fd`) |
| Delete from every bundle | `drush field:delete node --field-name=field_subtitle --all-bundles` |
| Base fields | `drush field:base-info node`, `drush field:base-override-create` |

`field:delete` takes entity type + bundle + `--field-name`, **not** `node.article.field_x`.

Common machine names: types `string`, `string_long`, `text_long`, `text_with_summary`, `integer`, `decimal`, `boolean`, `datetime`, `email`, `link`, `image`, `file`, `entity_reference`, `list_string`; widgets `string_textfield`, `string_textarea`, `text_textarea`, `text_textarea_with_summary`, `number`, `boolean_checkbox`, `options_select`, `options_buttons`, `datetime_default`, `email_default`, `link_default`, `image_image`, `file_generic`, `entity_reference_autocomplete`. Confirm on the target site with `drush field:types` / `drush field:widgets`.

## 5. Coding standards: phpcs + Coder

`drupal/core-dev` already requires `drupal/coder` (`^8.3.30` on 11.x; D12's core-dev moves to `^9.0`). Standalone:

```bash
composer require --dev drupal/coder
```

Coder pulls in `dealerdirect/phpcodesniffer-composer-installer`, which registers the `Drupal` and `DrupalPractice` standards automatically (Composer asks to allow the plugin: `allow-plugins.dealerdirect/phpcodesniffer-composer-installer: true`). `phpcs --config-set installed_paths …` is only needed for a global install. Coder 9 requires PHP_CodeSniffer 4, which no longer tokenizes CSS/JS — keep `css` out of the extension list.

```bash
EXT=php,module,inc,install,test,profile,theme,info,txt,md,yml
vendor/bin/phpcs  --standard=Drupal,DrupalPractice --extensions=$EXT web/modules/custom
vendor/bin/phpcbf --standard=Drupal,DrupalPractice --extensions=$EXT web/modules/custom   # auto-fix
```

Commit the settings as `phpcs.xml.dist` at the project root, then run just `vendor/bin/phpcs -p`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ruleset name="project">
  <file>web/modules/custom</file>
  <file>web/themes/custom</file>
  <arg name="extensions" value="php,module,inc,install,test,profile,theme,info,txt,md,yml"/>
  <rule ref="Drupal"/>
  <rule ref="DrupalPractice"/>
</ruleset>
```

Sources: Coder README (<https://git.drupalcode.org/project/coder/-/blob/9.0.1/README.md>), <https://www.drupal.org/project/coder>.

## 6. Pre-commit checklist

Run locally (inside DDEV/Docker if that is where PHP lives) before every commit or push:

1. `vendor/bin/phpcs -p` — zero errors; fix with `phpcbf`, then review the diff.
2. `vendor/bin/phpstan analyse` with `mglaman/phpstan-drupal` + `phpstan/phpstan-deprecation-rules` (the route documented on drupal.org; `drupal-check` has had no release since 2024 and is pinned to PHPStan 1).
3. Tests for the touched module: `vendor/bin/phpunit -c web/core/phpunit.xml.dist web/modules/custom/<module>` (see `drupal11-devops-testing-security`).
4. Security self-review with the checklist in `drupal11-devops-testing-security` → `references/secure-coding.md`: output escaping (no `|raw` / `Markup::create()` on input), CSRF on state-changing routes, upload validators, no secrets in logs/config/fixtures, no `unserialize()` of untrusted data.
5. `drush cr && drush cex -y` then `git status config/sync` — every config change you made is exported, nothing unexpected.
6. No debug leftovers: `rg -n "dpm\(|kint\(|dump\(|var_dump\(|print_r\(" web/modules/custom`.
7. New update code in the right place: `hook_update_N` / `hook_post_update_NAME` / `hook_deploy_NAME` (see `drupal11-devops-testing-security`).
8. `composer validate` if `composer.json` changed; commit `composer.lock` with it.

Optional git hook (`.git/hooks/pre-commit`, executable):

```bash
#!/usr/bin/env bash
set -e
vendor/bin/phpcs -p --report=summary
```

Prefer the same commands in CI so a skipped local hook is still caught.
