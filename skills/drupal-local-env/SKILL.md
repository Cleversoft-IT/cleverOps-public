---
name: drupal-local-env
description: Use when setting up, running or troubleshooting the local development environment of a Drupal project, either DDEV (.ddev/config.yaml, ddev start / drush / composer, snapshots, add-ons, Mutagen, Xdebug, ddev share, ddev pull) or a plain Docker Compose stack (compose.yaml / docker-compose.yml with PHP-FPM, nginx, MariaDB/MySQL, Redis). Use when you must first detect which of the two a project uses, when importing or exporting a local database, onboarding an existing project, adding Redis/Solr locally, or fixing port conflicts, file permissions, slow file sync and containers that will not start. Not for production deploy, tests or security (drupal11-devops-testing-security) nor config sync (drupal11-config-management).
---

# Drupal local environment (DDEV or Docker Compose)

## Overview

One skill for the two ways Drupal projects run locally: **DDEV** (opinionated wrapper around Docker) and a **plain Docker Compose** stack the team maintains by hand. The first job is always to find out which one the project uses, then to work *through* that tool: never mix `ddev` commands and raw `docker compose` commands on the same stack.

Baseline (checked against the official docs, see "Sources"):

- **DDEV ≥ 1.25.2** (upgrade older installs: `ddev utility port-diagnose` and `ddev utility tls-diagnose` used below arrived in 1.25.2): NFS mode removed, `performance_mode` replaces the old Mutagen flags, `ddev utility …` is the canonical name of the old `ddev debug …` (still accepted as an alias), services come from **add-ons**.
- **Docker Compose v2** (`docker compose`, Compose Specification): the top-level `version:` key is obsolete and only produces a warning.
- **Drupal 11**: PHP **8.3 minimum** (8.3 and 8.4 across 11.x; 8.5 from 11.3), MariaDB ≥ 10.6 / MySQL ≥ 8.0 / PostgreSQL ≥ 16, Drush 13 as a Composer dependency of the project.

## When to use

- A Drupal repo has a `.ddev/` folder or a Compose file and you need to start, inspect or fix it
- Creating a new Drupal 11 project locally, or onboarding an existing one (code + DB dump + files)
- Database import/export/snapshot on a local stack
- Adding Redis, Solr, Elasticsearch/OpenSearch, Mailpit or a DB GUI to the local stack
- Symptoms: port 80/443/3306 busy, `composer create-project` refuses to run, permission denied on `sites/default/files`, very slow page loads on macOS/Windows, Xdebug not connecting, a service that never becomes ready

**When NOT to use:**

- `drush deploy` internals, update hooks, CI pipelines, PHPUnit, `settings.php` hardening, security review → `drupal11-devops-testing-security`
- `drush cex/cim`, config split per environment, recipes → `drupal11-config-management`
- Redis bin layout and cache strategy as a performance decision → `drupal11-performance-caching`
- Module or theme code → the other `drupal11-*` skills

## Step 1: detect the environment

Run from the project root before suggesting any command:

```bash
# Tool markers (DDEV first: it also contains compose files of its own)
ls -a .ddev/config.yaml compose.yaml compose.yml docker-compose.yaml docker-compose.yml \
  compose.override.yaml docker-compose.override.yml .lando.yml .docksal 2>/dev/null
# Env files and command wrappers
ls -a .env .env.example Makefile justfile docker/ scripts/ 2>/dev/null
# Tools actually installed
ddev version 2>/dev/null | head -3; docker compose version
```

| What you find | Environment | How to proceed |
|---|---|---|
| `.ddev/config.yaml` | **DDEV** | Use `ddev …` for everything. `.ddev/docker-compose.*.yaml` are DDEV extensions, not a standalone stack: never run `docker compose` on them. Details: [references/ddev.md](references/ddev.md) |
| Compose file, no `.ddev/` | **Plain Docker Compose** | Read the Compose file first to learn service names (`php`, `web`, `app`, `db`, …), then use `docker compose exec <service> …`. Details: [references/docker-compose.md](references/docker-compose.md) |
| Both | Usually DDEV for dev, Compose for CI or image builds | Check README/Makefile; ask if still ambiguous |
| `.lando.yml`, `.docksal/` | Another tool | Out of scope: follow the project docs, do not convert silently |
| `Makefile` / `justfile` | Team wrapper | Prefer the wrapper targets (`make up`, `just drush cr`): they encode the team's service names and flags |
| Nothing | No local env yet | For a new Drupal project propose DDEV (quick start below) |

For DDEV also read `ddev describe` (URLs, services, host ports) and `ddev utility configyaml` (effective merged config). For Compose, `docker compose config` prints the merged, interpolated file and `docker compose ps` shows the running services.

### Reading an unfamiliar Compose stack

1. `docker compose config --services` lists the services.
2. The PHP service is the one built from a PHP Dockerfile or using a `php:*-fpm` / `drupal:*` image. Note where the project is mounted (`/var/www/html`, `/app`, `/opt/drupal` in the official `drupal` image) and its `working_dir`.
3. Find Drush: `docker compose exec <php> sh -c 'command -v drush || ls vendor/bin/drush'`.
4. The DB service: image (MariaDB, MySQL, PostgreSQL), its env variable prefix (`MARIADB_*`, `MYSQL_*`, `POSTGRES_*`) and data volume.
5. The docroot: `web/` or `docroot/` (see `extra.drupal-scaffold.locations.web-root` in `composer.json`).

## Step 2: command map

Same task, two environments. Replace `php` / `db` with the service names found in step 1.

| Task | DDEV | Docker Compose |
|---|---|---|
| Start / stop | `ddev start` / `ddev stop` (all projects: `ddev poweroff`) | `docker compose up -d` / `docker compose stop` |
| Rebuild after config or image change | `ddev restart` (verbose rebuild: `ddev utility rebuild`) | `docker compose up -d --build` |
| Shell in the PHP container | `ddev ssh` | `docker compose exec php bash` |
| Drush | `ddev drush <cmd>` | `docker compose exec php vendor/bin/drush <cmd>` |
| Composer | `ddev composer <cmd>` | `docker compose exec php composer <cmd>` |
| DB client | `ddev mysql` / `ddev mariadb` / `ddev psql` | `docker compose exec db mariadb -u<user> -p <db>` |
| Import dump | `ddev import-db --file=dump.sql.gz` | `gzip -t dump.sql.gz`, then `gzip -cd dump.sql.gz \| docker compose exec -T db mariadb …` with `pipefail` ([script](references/docker-compose.md#9-database-operations)) |
| Export dump | `ddev export-db --file=dump.sql.gz` | `docker compose exec -T db mariadb-dump … \| gzip > dump.sql.gz.part` with `pipefail`, then `mv` to the final name ([script](references/docker-compose.md#9-database-operations)) |
| Safety copy of the DB | `ddev snapshot` → `ddev snapshot restore --latest` | export dump (above) before risky operations |
| Logs | `ddev logs -f` (`-s db` for another service) | `docker compose logs -f <service>` |
| URLs / ports | `ddev describe` | `docker compose ps`, `docker compose port web 80` |
| Mail catcher | built-in Mailpit: `ddev mailpit` | add a Mailpit service (see reference) |
| Full reset (**destroys data**) | `ddev delete` (takes a snapshot unless `--omit-snapshot`) | `docker compose down -v` |

Always use `-T` when piping into or out of `docker compose exec`: Compose allocates a TTY by default and a TTY mangles binary/SQL streams (corrupted dumps, stuck imports). And run DB pipes under `set -o pipefail` (bash): a pipeline returns the status of its **last** command, so without it a failed `mariadb-dump` still leaves a valid-looking empty `.gz` and exit code 0, and a truncated archive can be half-imported "successfully". For MySQL images the client tools are `mysql` / `mysqldump`; in current MariaDB images use `mariadb` / `mariadb-dump`.

## Step 3: rules that apply to both

1. **Do not publish database or cache ports on the host.** Services reach each other by service name (`db`, `redis`) on the project network. If a host GUI really needs the DB, bind to loopback only (`127.0.0.1:3306:3306`); Docker otherwise publishes on all interfaces. DDEV already assigns a random host DB port (see `ddev describe`); pin it with `host_db_port` only if needed.
2. **Snapshot before destructive steps** (import over an existing DB, `drush sql:drop`, `down -v`, `ddev delete`).
3. **Settings via an environment-specific include**, not by editing the committed `settings.php` body: DDEV generates `settings.ddev.php` (git-ignored); a Compose stack uses a `settings.local.php` or env vars read with `getenv()`. Hardening of production settings → `drupal11-devops-testing-security`.
4. **After pulling code or importing a DB, run `drush deploy`** (updatedb, config:import, cache:rebuild, deploy:hook, per drush.org). Do not hand-roll `updb`/`cim`/`cr` sequences in scripts; the exact order and hook semantics are in `drupal11-devops-testing-security`, config conflicts in `drupal11-config-management`.
5. **Never commit secrets**: API tokens (Upsun, ngrok, Cloudflare) go in DDEV global config or `.ddev/config.local.yaml`; Compose passwords go in an uncommitted `.env` (commit `.env.example`).
6. **Pin versions** (PHP, DB, Redis image tags) in the committed config so every developer runs the same stack.

### Commands that need the user's go-ahead

Local environments hold the user's data and often other projects. Ask before running:

| Command | Risk | Safer default |
|---|---|---|
| `ddev delete`, `docker compose down -v` | deletes the project database | snapshot/export first, or just `ddev stop` / `docker compose down` |
| `ddev import-db`, `drush sql:drop`, `drush site:install` on an existing site | replaces the current DB | `ddev snapshot` or an export first |
| `ddev poweroff`, `ddev stop --all` | stops every DDEV project, not only this one | `ddev restart` of the current project |
| `docker system prune`, `docker volume prune`, `docker volume rm` | removes other projects' images and data | never without explicit consent |
| `ddev config …` on an existing project | rewrites `.ddev/config.yaml` | change one key, or use `.ddev/config.local.yaml`; show the diff |
| `ddev add-on get` | adds files to `.ddev/` and, for Drupal, to `sites/default/` | say which files changed so they can be reviewed and committed |
| `ddev push`, `ddev pull` | moves real data to or from a hosting environment | only on explicit request; never push a DB upstream by default |

## Common workflows

### New Drupal 11 project (DDEV)

```bash
mkdir my-site && cd my-site
ddev config --project-type=drupal11 --docroot=web
ddev start
ddev composer create-project "drupal/recommended-project:^11"
ddev composer require "drush/drush:^13"
ddev drush site:install --account-name=admin --account-pass=admin -y
ddev launch $(ddev drush uli)
```

This is the official DDEV Drupal quickstart (docs.ddev.com/en/stable/users/quickstart/, Drupal section) pinned to Drupal 11; for Drupal 10 use `--project-type=drupal10` and `drupal/recommended-project:^10`. HTTPS on `*.ddev.site` works out of the box once `mkcert -install` has been run once on the machine; if the browser distrusts the certificate, run `ddev utility tls-diagnose`.

`ddev composer create-project` refuses a non-empty project, but it ignores `.git`, `.ddev`, `.claude`, `.idea`, `.vscode`, `.devcontainer` and `.tarballs`. Do **not** move `.git` out of the way; move only other top-level files (for example `README.md`, `AGENTS.md`) aside and restore them afterwards. For a Compose project, `composer create-project` runs inside the PHP container: see [references/docker-compose.md](references/docker-compose.md).

### Onboard an existing project

```bash
# DDEV
ddev start
ddev composer install
ddev import-db --file=path/to/dump.sql.gz
ddev drush deploy -y
ddev launch $(ddev drush uli)

# Docker Compose (after creating .env from .env.example)
docker compose up -d --wait        # waits for healthchecks
docker compose exec php composer install
(
  set -euo pipefail
  gzip -t path/to/dump.sql.gz     # refuse a corrupted archive before touching the DB
  gzip -cd path/to/dump.sql.gz \
    | docker compose exec -T db sh -c 'exec mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"'
  docker compose exec php vendor/bin/drush deploy -y
)
```

User files: `ddev import-files --source=path/to/files.tar.gz`, or unpack into `web/sites/default/files` for Compose. Pulling DB and files from a host (Upsun, Pantheon, Acquia, Lagoon) is `ddev pull <provider>`: see [references/ddev.md](references/ddev.md).

### Add Redis

- **DDEV**: `ddev add-on get ddev/ddev-redis && ddev restart`, then `ddev composer require drupal/redis` and `ddev drush en redis -y`. On Drupal projects the add-on writes a git-ignored `settings.ddev.redis.php` that activates only once the module and the phpredis extension are present.
- **Compose**: a `redis` service with a healthcheck and **no published port**, the phpredis extension in the PHP image, the `drupal/redis` module and a guarded settings include: see [references/docker-compose.md](references/docker-compose.md).

Solr, Elasticsearch/OpenSearch, Memcached, phpMyAdmin/Adminer and headless Chrome are official DDEV add-ons too; do not hand-write compose files for them.

### Verify that the environment works

```bash
# DDEV
ddev describe                               # all services "OK", URLs listed
ddev drush status --fields=drupal-version,php-version,db-status,bootstrap
curl -skI "$(ddev describe -j | jq -r .raw.primary_url)" | head -1

# Docker Compose
docker compose ps                           # db/redis "healthy", php and web "running"
docker compose exec php vendor/bin/drush status --fields=drupal-version,php-version,db-status,bootstrap
curl -sI http://127.0.0.1:8080 | head -1    # use the host port from compose.yaml
```

Expected: database `Connected`, Drupal bootstrap `Successful`, HTTP 200 (or 302 to the installer on an empty DB). Then log in with `drush uli` and check `/admin/reports/status` for PHP extension or settings warnings.

## Troubleshooting (both environments)

| Symptom | DDEV | Docker Compose |
|---|---|---|
| Port 80/443 already in use | `ddev utility port-diagnose` names the process; or move the router: `ddev config global --router-http-port=8080 --router-https-port=8443` | `sudo ss -ltnp 'sport = :8080'` (or `lsof -i :8080`); change the host side of `ports:` |
| Port 3306/6379 conflict | DDEV does not need fixed DB ports: remove any `host_db_port` pin | You are publishing DB/Redis ports: remove the `ports:` entry (rule 1) |
| Container will not start / keeps restarting | `ddev logs -s <service>`, `ddev utility diagnose`, then `ddev utility rebuild` | `docker compose logs <service>`, `docker compose ps` (health column), `docker compose up -d --build` |
| App starts before the DB is ready | handled by DDEV | add a DB `healthcheck` and `depends_on: {db: {condition: service_healthy}}` |
| Permission denied on `sites/default/files` or generated files | The web container already runs with your host UID/GID: no `chown` inside it. Look for files created by `sudo` or by root in another container and fix ownership on the host | PHP-FPM runs as `www-data` by default: run the PHP service as your UID (`user:`), see reference |
| Very slow on macOS/Windows | Mutagen: `performance_mode: mutagen` (default there); `ddev utility mutagen-diagnose`; keep user files in `upload_dirs` | Docker Desktop with VirtioFS (default) or Synchronized file shares; do not rely on `:cached` |
| `composer create-project` "not allowed to be present" | move stray top-level files aside (not `.git`) | run it in an empty directory or into a subfolder, then move |
| DB connection refused from Drupal | host is `db`, port 3306 (inside the containers); from the host use the port in `ddev describe` | host is the DB **service name**, not `localhost`; check `docker compose exec php getent hosts db` |
| Xdebug does not connect | `ddev xdebug on`, IDE listening on 9003, `ddev utility xdebug-diagnose` | `xdebug.client_host=host.docker.internal` (+ `extra_hosts: ["host.docker.internal:host-gateway"]` on Linux) |
| Stale code or config after `git pull` | `ddev drush deploy -y` | `docker compose exec php vendor/bin/drush deploy -y` |
| Everything is weird | `ddev poweroff && ddev start` (stops all DDEV projects: ask first) | `docker compose down && docker compose up -d --build` (without `-v`) |

## Reference map

| File | Read it for |
|---|---|
| [references/ddev.md](references/ddev.md) | `config.yaml` keys and override files, project types, full command reference (lifecycle, DB, snapshots, `ddev utility`), Drupal settings management, add-ons (Redis, Solr, search, DB GUIs), custom compose services when no add-on exists, PHP/nginx overrides, Mutagen, Xdebug, `ddev share` (ngrok/cloudflared), `ddev pull/push` providers (Upsun, Pantheon, Acquia, Lagoon, custom), custom commands, CI, and the **outdated → current** command table |
| [references/docker-compose.md](references/docker-compose.md) | A complete Drupal 11 stack (`compose.yaml` without `version:`, healthchecks, `depends_on` conditions, loopback-only web port, named volumes), `.env`, new-project bootstrap, PHP 8.4 FPM Dockerfile with extensions and a dedicated ini file, nginx server block for Drupal, `settings.php` for containers, Redis with the module, DB dump/restore with `-T`, UID mapping for permissions, Mailpit, Xdebug, Makefile/justfile wrappers, file sync performance |

Load only the reference for the environment detected in step 1.

## Cross-skill handoff

- Deploy pipeline, `drush deploy` order, update/deploy hooks, PHPUnit/Nightwatch in CI, `settings.php` hardening → `drupal11-devops-testing-security`
- Config sync after a DB import, config split for the local environment, recipes → `drupal11-config-management`
- Redis bins, chainedfast, cache tags → `drupal11-performance-caching`
- Twig debug and asset build tooling in the container → `drupal11-frontend-theming`

## Sources

Checked against: DDEV docs (docs.ddev.com: commands reference, config options, performance, quickstart, troubleshooting, sharing, providers, custom compose files) and the v1.25.0 / v1.25.2 release notes (ddev.com/blog, github.com/ddev/ddev/releases); the add-on registry (addons.ddev.com) and the `ddev/ddev-redis` repository; Docker docs (docs.docker.com: `compose exec`, startup order, Compose file reference, port publishing); the PHP and MariaDB official images (hub.docker.com, mariadb.com docs); Drupal system requirements (drupal.org); Drush 13 `deploy` docs (drush.org); the `drupal/redis` module README. Re-verify versions before pinning them in a new project.
