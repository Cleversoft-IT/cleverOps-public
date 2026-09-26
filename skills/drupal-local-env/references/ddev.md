# DDEV for Drupal: reference

Baseline: DDEV **≥ 1.25.2** (`ddev utility port-diagnose`, `tls-diagnose` and `check-custom-config` were added in 1.25.2; check with `ddev version`). Core commands below are in the official commands reference (docs.ddev.com, "Commands"); add-on commands (`ddev redis-cli`, `ddev phpmyadmin`, …) are documented in each add-on's README. Run `ddev <cmd> --help` when in doubt: flags change between releases.

## Contents

1. Outdated habits → current commands
2. `.ddev/config.yaml`
3. Command reference
4. Drupal setup and settings management
5. Add-ons (services)
6. Custom services and overrides
7. Performance (Mutagen)
8. Xdebug
9. Sharing a site
10. Pulling from hosting providers
11. Custom commands
12. CI

## 1. Outdated habits → current commands

Old DDEV snippets are everywhere online. Replace them:

| Outdated | Current |
|---|---|
| `ddev restore` (does not exist) | `ddev snapshot restore <name>` or `ddev snapshot restore --latest` |
| `mutagen_enabled: true`, `ddev config --mutagen-enabled` | `performance_mode: mutagen`, `ddev config --performance-mode=mutagen` (global: `ddev config global --performance-mode=mutagen`) |
| `nfs_mount_enabled`, `performance_mode: nfs`, `--nfs-mount-enabled` | **Removed in 1.25.0**: use Mutagen (or `none` on Linux/WSL2) |
| `ddev debug refresh` | `ddev utility rebuild` (`refresh` is an alias) |
| `ddev debug capabilities`, `ddev debug router` | not in current releases: use `ddev utility diagnose`, `ddev utility dockercheck`, `ddev utility port-diagnose` |
| `ddev debug <anything>` | `ddev utility <anything>` (`debug` is kept only as an alias) |
| `ddev get <addon>`, `ddev service enable` | `ddev add-on get <org/repo>`, `ddev add-on remove <name>` |
| Hand-written `.ddev/docker-compose.redis.yaml` / `solr` / `elasticsearch` with `version: '3.6'` | Official add-ons (section 5); no `version:` key in any compose file |
| `ddev config --project-type=drupal` for a Drupal 11 site | `--project-type=drupal11`: plain `drupal` means "latest stable Drupal" and will switch to `drupal12` settings when Drupal 12 ships |
| Custom `.ddev/providers/platform.yaml` calling `platform db:dump` | Built-in providers: `ddev pull upsun` (Upsun Flex) or `ddev pull platform` (Upsun Fixed, formerly Platform.sh) |
| `ddev share` = ngrok only | `ddev share --provider=cloudflared` (free, no account) or ngrok (default) |
| `ddev exec chown -R $(id -u):$(id -g) .` | Not needed: the web container runs with the host UID/GID, and `$(id -u)` expands on the host anyway |
| Moving `.git` / `.claude` to `/tmp` before `create-project` | Not needed: those folders are skipped by the emptiness check |
| `drush updb && drush cim && drush cr` in scripts | `drush deploy` |
| `ddev self-upgrade` to upgrade | It only prints upgrade instructions for your install method |

## 2. `.ddev/config.yaml`

Created by `ddev config`; commit it (and the whole `.ddev/` folder except what `.ddev/.gitignore` lists).

```yaml
name: my-site
type: drupal11
docroot: web
php_version: "8.4"          # 8.3 minimum for Drupal 11; DDEV default for new projects is 8.4
webserver_type: nginx-fpm   # or apache-fpm
database:
  type: mariadb
  version: "11.8"           # DDEV default; must satisfy Drupal 11 (MariaDB ≥ 10.6, MySQL ≥ 8.0)
nodejs_version: "22"        # for theme builds; "auto" reads .node-version / .nvmrc / package.json engines
corepack_enable: false      # true to get pnpm / yarn via corepack
additional_hostnames: [api.my-site]   # → api.my-site.ddev.site
webimage_extra_packages: ["php${DDEV_PHP_VERSION}-imagick"]
upload_dirs:
  - sites/default/files     # relative to docroot; keep the Drupal default when overriding
  - ../private
```

- **Overrides**: `.ddev/config.local.yaml` is git-ignored by default: per-developer tokens and personal ports go there, never in `config.yaml`. Other `.ddev/config.*.yaml` files are merged on top of `config.yaml` too and are normally committed (add-ons create some of them).
- **Effective config**: `ddev utility configyaml` (add `--omit-keys=web_environment` before pasting output anywhere).
- **Database engine change**: changing `database.type/version` on an existing project needs a migration (`ddev utility migrate-database`, or export → `ddev delete` → change config → `ddev start` → import; see section 3); snapshot first.
- **Host ports**: `host_db_port` and `host_webserver_port` are random by default; pin them only when a tool needs a stable port.

## 3. Command reference

```bash
# Lifecycle
ddev start | stop | restart | describe | list | launch
ddev poweroff                 # stop every project and the router
ddev stop --unlist            # stop and remove from the global list
ddev delete                   # remove containers + DB (snapshot first unless --omit-snapshot); code stays
ddev restart --no-cache       # rebuild images without Docker cache

# Running things
ddev drush <cmd>              # Drush must be a project dependency (composer require drush/drush)
ddev composer <cmd>
ddev php <script> | ddev npm <cmd>
ddev exec <cmd>               # web container; -s <service> for others
ddev ssh                      # shell in web; ddev ssh -s db

# Database
ddev mysql | ddev mariadb | ddev psql
ddev import-db --file=dump.sql.gz        # drops the DB first; --no-drop to keep it
ddev import-db < dump.sql                # stdin works too
ddev export-db --file=dump.sql.gz        # gzip by default; --gzip=false for plain SQL
ddev snapshot                            # also: --name <n>, --list, --cleanup, --all
ddev snapshot restore --latest           # or: ddev snapshot restore <name>
ddev import-files --source=files.tar.gz  # into the first upload_dirs entry
ddev heidisql | sequelace | tableplus | dbeaver   # open a host DB GUI

# Logs and mail
ddev logs -f                  # -s db for another service, --tail 100
ddev mailpit                  # or: ddev launch -m

# Diagnostics
ddev utility diagnose         # quick health check of DDEV + current project
ddev utility port-diagnose    # which process holds the ports the project needs
ddev utility dockercheck      # Docker provider details
ddev utility rebuild          # rebuild web image verbosely (--service db, --all, --cache)
ddev utility compose-config   # final merged compose config DDEV generates
ddev utility mutagen-diagnose | xdebug-diagnose
```

Snapshots live in `.ddev/db_snapshots/` and are tied to the DB type and version. `ddev snapshot restore --force <name>` only skips the version check between versions of the **same** server (e.g. an older MariaDB snapshot on a newer MariaDB) and "may not succeed": it is not a migration. To change engine or version, migrate the database instead: `ddev utility migrate-database mariadb:11.8` (MySQL/MariaDB only: it exports, snapshots, recreates the DB and updates `config.yaml`), or follow the manual sequence from the DDEV database-management docs: verified export (`ddev export-db --file=…`) → `ddev delete` (removes the old DB volume) → change `database:` in `config.yaml` → `ddev start` → `ddev import-db --file=…`. A plain `ddev restart` after editing `database:` keeps the old data volume and is not a migration.

## 4. Drupal setup and settings management

New project (official quickstart, pinned to Drupal 11):

```bash
mkdir my-site && cd my-site
ddev config --project-type=drupal11 --docroot=web
ddev start
ddev composer create-project "drupal/recommended-project:^11"
ddev composer require "drush/drush:^13"
ddev drush site:install --account-name=admin --account-pass=admin -y
ddev launch $(ddev drush uli)
```

Drupal 10 variant: `--project-type=drupal10` and `drupal/recommended-project:^10` (source: DDEV quickstart, Drupal section).

HTTPS: DDEV serves `https://<project>.ddev.site` with certificates from a local CA created by mkcert. Run `mkcert -install` once per machine (part of the DDEV install steps); if browsers or `curl` still distrust the certificate, `ddev utility tls-diagnose` checks mkcert, `CAROOT`, the OS trust store and (on WSL2) the Windows side.

`ddev composer create-project` checks that the project is essentially empty, but skips `.git`, `.ddev`, `.claude`, `.idea`, `.vscode`, `.devcontainer`, `.tarballs` and `.DS_Store`. Any other top-level file (README, AGENTS.md, a stray `composer.json`) makes it fail with "is not allowed to be present": move just those aside and back.

Settings: for Drupal types DDEV writes `web/sites/default/settings.ddev.php` (DB host/name/user/password all `db`, git-ignored, marked `#ddev-generated`) and appends to `settings.php` an include guarded by `getenv('IS_DDEV_PROJECT') == 'true'`, so it has no effect outside DDEV. To take the file over, remove the `#ddev-generated` line; to stop DDEV from touching settings at all, `ddev config --disable-settings-management`. Keep project-wide local tweaks (verbose errors, disabled caches) in a `settings.local.php` included from `settings.php`; production hardening → `drupal11-devops-testing-security`.

Existing project: `ddev config --project-type=drupal11 --docroot=web` (only if `.ddev/` is missing), `ddev start`, `ddev composer install`, `ddev import-db --file=…`, `ddev import-files --source=…`, `ddev drush deploy -y`.

## 5. Add-ons (services)

Official add-ons are maintained by the DDEV team and listed at addons.ddev.com (`ddev add-on list` from the CLI). Install, then restart and commit `.ddev/`:

```bash
ddev add-on get ddev/ddev-redis && ddev restart
ddev add-on list --installed
ddev add-on remove redis
```

| Need | Add-on | Inside the containers |
|---|---|---|
| Redis / Valkey cache | `ddev/ddev-redis` | `redis:6379`; `ddev redis-cli`; `ddev redis-backend valkey` to switch image |
| Memcached | `ddev/ddev-memcached` | `memcached:11211` |
| Solr (Search API Solr) | `ddev/ddev-solr` (prefer it over the older `ddev/ddev-drupal-solr`) | `http://solr:8983`, Solr Cloud with basic auth (`solr` / `SolrRocks` by default) |
| Elasticsearch | `ddev/ddev-elasticsearch` | `http://elasticsearch:9200` |
| OpenSearch | `ddev/ddev-opensearch` | see add-on README |
| DB GUI in the browser | `ddev/ddev-phpmyadmin`, `ddev/ddev-adminer` | `ddev phpmyadmin` / `ddev adminer` |
| Headless Chrome for FunctionalJavascript / Nightwatch | `ddev/ddev-selenium-standalone-chrome` (v2 for Drupal 11) | see add-on README |
| Cron | `ddev/ddev-cron` | runs scheduled commands in web |
| Upsun tooling | `ddev/ddev-upsun` | fuller Upsun integration than `ddev pull` |

**Redis for Drupal.** On `drupal*` project types `ddev-redis` copies a `settings.ddev.redis.php` (git-ignored, `#ddev-generated`) and appends an include guarded by `IS_DDEV_PROJECT` (skipped if settings management is disabled). That file only activates when the phpredis extension is loaded **and** the `drupal/redis` module code is present, so:

```bash
ddev add-on get ddev/ddev-redis && ddev restart
ddev composer require drupal/redis
ddev drush en redis -y
ddev redis-cli INFO keyspace          # keys should grow as you browse
```

The Redis module README suggests, for parity with production, copying its `settings.redis.example.php` into a committed `settings.redis.php` and overriding only the host under DDEV (`$settings['redis.connection']['host'] = 'redis';`). Bin layout and chainedfast → `drupal11-performance-caching`.

**Solr for Drupal.** With `search_api_solr` ≥ 4.2.1 enable `search_api_solr_admin`, create a Search API server using the "Solr Cloud with Basic Auth" connector, host `solr` (not `localhost`), then upload the configset: `ddev drush --numShards=1 search-api-solr:upload-configset <server_id>`.

## 6. Custom services and overrides

Write a `.ddev/docker-compose.<name>.yaml` only when no add-on exists. Rules from the DDEV docs:

```yaml
# .ddev/docker-compose.example.yaml  (no top-level version: key)
services:
  example:
    image: vendor/example:1.2.3
    container_name: ddev-${DDEV_SITENAME}-example
    labels:                          # required before DDEV 1.25.2 (added automatically since); keep them
      com.ddev.site-name: ${DDEV_SITENAME}
      com.ddev.approot: ${DDEV_APPROOT}
    expose:
      - "3000"
    environment:
      - VIRTUAL_HOST=$DDEV_HOSTNAME
      - HTTP_EXPOSE=3001:3000       # http://<project>.ddev.site:3001
      - HTTPS_EXPOSE=3000:3000      # https://<project>.ddev.site:3000
```

- Prefer `expose` + `HTTP(S)_EXPOSE` over `ports`: fixed host ports prevent two projects from running at once. Use `ports` only for non-HTTP services that must bind to localhost.
- Check the result with `ddev utility compose-config`.

Other override points (each needs `ddev restart`):

| What | Where |
|---|---|
| PHP settings | `.ddev/php/*.ini`, copied into both CLI and FPM `conf.d`; include the `[PHP]` section header |
| nginx snippet | `.ddev/nginx/<name>.conf` (added to the generated site config) |
| Full nginx site config | `.ddev/nginx_full/nginx-site.conf` after removing `#ddev-generated` |
| MariaDB/MySQL settings | `.ddev/mysql/*.cnf` (with `[mysqld]` header) |
| Extra Debian packages | `webimage_extra_packages` in `config.yaml` |
| Custom web image steps | `.ddev/web-build/Dockerfile` or `Dockerfile.<name>` |

```ini
; .ddev/php/my-php.ini
[PHP]
memory_limit = 512M
upload_max_filesize = 64M
post_max_size = 64M
```

## 7. Performance (Mutagen)

- `performance_mode` can be `global` (follow global setting), `none` or `mutagen`. Mutagen is the default on macOS and traditional Windows; on Linux and WSL2 bind mounts are already fast and Mutagen brings little.
- Do not commit `performance_mode: mutagen` if teammates are on Linux: set it globally (`ddev config global --performance-mode=mutagen`) or in a `.ddev/config.performance.yaml` that you keep out of Git (add it to `.gitignore`).
- Exclude big generated folders by adding them to `upload_dirs` (bind-mounted instead of synced), keeping the Drupal default:

  ```yaml
  upload_dirs:
    - sites/default/files
    - themes/custom/my_theme/node_modules   # relative to docroot
  ```

  Then `ddev restart`. After changing `upload_dirs` or `.ddev/mutagen/mutagen.yml`, run `ddev mutagen reset`.
- Do large Git operations (branch switches) on the host, then `ddev mutagen sync`. If files changed while the project was stopped, `ddev mutagen reset` before `ddev start`.
- Commands: `ddev mutagen status | sync | monitor | reset | logs`; diagnosis: `ddev utility mutagen-diagnose`.

## 8. Xdebug

```bash
ddev xdebug on | off | toggle | status | info   # off by default for speed
ddev utility xdebug-diagnose                     # guided checks (--interactive)
```

- The IDE listens on **9003**; the container reaches it at `host.docker.internal:9003`. Firewalls blocking 9003 are the usual culprit.
- **PhpStorm**: start listening; on the first request it offers to create the server (name = project hostname, mapping project root → `/var/www/html`).
- **VS Code** (PHP Debug extension), `.vscode/launch.json` from the DDEV docs:

  ```json
  {
    "version": "0.2.0",
    "configurations": [
      {
        "name": "Listen for Xdebug",
        "type": "php",
        "request": "launch",
        "hostname": "0.0.0.0",
        "port": 9003,
        "pathMappings": { "/var/www/html": "${workspaceFolder}" }
      }
    ]
  }
  ```

- Different port: `.ddev/php/xdebug_client_port.ini` with `xdebug.client_port=9000`.
- Modes: with `ddev xdebug on` DDEV runs `xdebug.mode=debug,develop` (step debugging plus Xdebug's development helpers such as richer `var_dump()` and error output). Check with `ddev exec php -i | grep xdebug.mode`.
- Profiling (per the DDEV Xdebug profiling docs): create `.ddev/xdebug/`, add `.ddev/php/xdebug.ini`, `ddev restart`, `ddev xdebug on`, make a request, open the `.out` file with a cachegrind viewer (e.g. KCachegrind), then `ddev xdebug off` and remove the file. For routine profiling DDEV's built-in XHProf with XHGui is lighter: `ddev config global --xhprof-mode=xhgui && ddev restart`, then `ddev xhgui on` and `ddev xhgui launch`.

  ```ini
  ; .ddev/php/xdebug.ini (temporary)
  [PHP]
  xdebug.mode=profile
  xdebug.start_with_request=yes
  xdebug.output_dir=/var/www/html/.ddev/xdebug
  xdebug.profiler_output_name=trace.%c%p%r%u.out
  ```

- Coverage runs: with Xdebug on, `ddev exec env XDEBUG_MODE=coverage vendor/bin/phpunit …` (test setup → `drupal11-devops-testing-security`).

## 9. Sharing a site

```bash
ddev share                                   # ngrok (default), needs an ngrok account/token
ddev share --provider=cloudflared            # free, no account; needs the cloudflared binary on the host
ddev config --share-default-provider=cloudflared         # per project
ddev config global --share-default-provider=cloudflared  # for all projects
```

The cloudflared provider runs the `cloudflared` CLI on your machine: install it first from Cloudflare's installation guide (developers.cloudflare.com, "cloudflared" downloads). Tunnel URLs are random `*.trycloudflare.com` hosts; a stable custom hostname needs a Cloudflare account and a domain on Cloudflare DNS. Custom providers go in `.ddev/share-providers/`. If Drupal answers "The provided host name is not valid for this server", the tunnel hostname is not allowed by `trusted_host_patterns` in the local settings.

## 10. Pulling from hosting providers

Built-in integrations: Upsun (Flex), Upsun Fixed (formerly Platform.sh), Pantheon, Acquia, Lagoon, plus generic `rsync`, `git` and `localfile` recipes.

```bash
# Upsun Flex: token once, globally (never in committed config)
ddev config global --web-environment-add="UPSUN_CLI_TOKEN=<token>"
ddev pull upsun                 # --skip-files / --skip-db / -y
# Upsun Fixed (Platform.sh): PLATFORMSH_CLI_TOKEN, then
ddev pull platform
ddev push <provider>            # the reverse; think twice before pushing a DB upstream
```

Project and environment IDs come from the provider docs (Upsun can derive them from `.upsun/local/project.yaml` and the Git branch). A custom provider is a YAML file in `.ddev/providers/` with `environment_variables`, `db_pull_command`, `files_pull_command` (and optional push commands); do not name it like a built-in provider unless you mean to override it. After a pull: `ddev drush deploy -y`.

## 11. Custom commands

Scripts in `.ddev/commands/<service>/` become `ddev <name>`: `host/` runs on your machine, `web/` and `db/` (or any service name) inside that container. Global ones live in `~/.ddev/commands/` and are copied to projects on `ddev start`.

```bash
#!/usr/bin/env bash
## Description: Reset the local DB from a reference dump and apply code changes
## Usage: refresh [dump]
## Example: ddev refresh .tarballs/reference.sql.gz
# .ddev/commands/host/refresh  (chmod +x)
set -euo pipefail
dump="${1:-.tarballs/reference.sql.gz}"
ddev snapshot --name "before-refresh-$(date +%Y%m%d%H%M%S)"
ddev import-db --file="$dump"
ddev drush deploy -y
ddev drush uli
```

`## Description`, `## Usage`, `## Example` are the required annotations; `## Flags`, `## ProjectTypes`, `## ExecRaw` are optional.

## 12. CI

DDEV runs in CI with the official GitHub Action (`ddev/github-action-setup-ddev`, current major `v1`):

```yaml
# .github/workflows/test.yml (excerpt)
steps:
  - uses: actions/checkout@v4
  - uses: ddev/github-action-setup-ddev@v1
  - run: ddev composer install
  - run: ddev exec vendor/bin/phpunit -c web/core/phpunit.xml.dist web/modules/custom
```

What to test and how (PHPUnit 11, Kernel/Functional, Nightwatch) → `drupal11-devops-testing-security`.
