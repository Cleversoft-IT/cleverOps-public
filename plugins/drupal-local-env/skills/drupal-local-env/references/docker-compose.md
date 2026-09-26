# Plain Docker Compose for Drupal 11: reference

Baseline: Docker Compose v2 (`docker compose`, Compose Specification), official `php`, `nginx`, `mariadb`, `redis` images, Drupal 11 (PHP ≥ 8.3). When a project already has its own stack, **read it first** and adapt to its service names; the template below is for new stacks or for fixing a broken one.

## Contents

1. Outdated patterns → current
2. File layout
3. `compose.yaml`
4. `.env` and a new project
5. PHP image and ini
6. nginx server block
7. Drupal settings for containers
8. Redis
9. Database operations
10. Permissions (UID mapping)
11. Mail and Xdebug
12. Command wrappers
13. File sync performance
14. Compose-specific troubleshooting

## 1. Outdated patterns → current

| Outdated | Current | Why |
|---|---|---|
| `version: '3.8'` at the top | remove it | obsolete: Compose ignores it and prints a warning |
| `docker-compose` (v1 binary) | `docker compose` | v1 is gone; v2 is the Docker CLI plugin |
| `depends_on: [db]` | long syntax with `condition: service_healthy` + a DB `healthcheck` | the short form only waits for the container to *start*, not for MariaDB to accept connections |
| `ports: ["3306:3306"]`, `["6379:6379"]` | no `ports:` for DB/Redis (or `127.0.0.1:3306:3306`) | Docker publishes on all interfaces by default: your DB is reachable from the LAN |
| `- .:/var/www/html:cached` | `- .:/var/www/html` | `:cached` was an osxfs hint; current Docker Desktop uses VirtioFS and on Linux it never mattered |
| `environment: PHP_MEMORY_LIMIT=512M` | an ini file in `$PHP_INI_DIR/conf.d/` | the official `php` image reads no such variable: the setting is silently ignored |
| `FROM php:8.2-fpm` | `FROM php:8.4-fpm` (8.3 minimum) | Drupal 11 requires PHP 8.3+ |
| `docker compose exec db mysqldump … > dump.sql` | `docker compose exec -T db mariadb-dump … > dump.sql` | without `-T` a TTY is allocated and the dump can be corrupted |
| passwords hard-coded in the committed compose file | `${VAR:?}` from an uncommitted `.env` | secrets out of Git, loud failure when missing |
| `$settings['cache']['default'] = 'cache.backend.redis'` alone | `drupal/redis` module + its example settings (with `container_yamls`) | without the module/services the site fatals or only half uses Redis |
| `chown -R www-data:www-data` on the bind mount | run PHP with your host UID (section 10) | chown on a bind mount changes ownership of your working copy |
| `COPY --from=composer:latest` | `COPY --from=composer:2` | pin the major version |

## 2. File layout

```text
compose.yaml                     # canonical name; docker-compose.yml still works
.env.example                     # committed; copy to .env (git-ignored)
docker/php/Dockerfile
docker/php/conf.d/drupal.ini
docker/nginx/default.conf
web/sites/default/settings.local.php   # git-ignored, container-specific settings
```

## 3. `compose.yaml`

```yaml
# No top-level "version:" key.
services:
  php:
    build:
      context: .
      dockerfile: docker/php/Dockerfile
      args:
        PHP_VERSION: ${PHP_VERSION:-8.4}
    user: "${LOCAL_UID:-1000}:${LOCAL_GID:-1000}"
    volumes:
      - .:/var/www/html
    environment:
      DB_HOST: db
      DB_NAME: ${DB_NAME:-drupal}
      DB_USER: ${DB_USER:-drupal}
      DB_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
      REDIS_HOST: redis
      COMPOSER_HOME: /tmp/composer
    extra_hosts:
      - "host.docker.internal:host-gateway"   # Xdebug on Linux
    depends_on:
      db:
        condition: service_healthy
        restart: true
      redis:
        condition: service_healthy

  web:
    image: nginx:stable-alpine
    ports:
      - "127.0.0.1:${WEB_PORT:-8080}:80"     # loopback only
    volumes:
      - .:/var/www/html:ro
      - ./docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      php:
        condition: service_started

  db:
    image: mariadb:11.8
    environment:
      MARIADB_ROOT_PASSWORD: ${DB_ROOT_PASSWORD:?set DB_ROOT_PASSWORD in .env}
      MARIADB_DATABASE: ${DB_NAME:-drupal}
      MARIADB_USER: ${DB_USER:-drupal}
      MARIADB_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      start_period: 10s
      interval: 10s
      timeout: 5s
      retries: 3
    # no "ports:": other services reach it as db:3306

  redis:
    image: redis:7-alpine          # or valkey/valkey:8-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  mailpit:
    image: axllent/mailpit:v1
    ports:
      - "127.0.0.1:8025:8025"      # web UI; SMTP stays internal on mailpit:1025

volumes:
  db-data:
```

- `docker compose up -d --wait` returns when every service with a healthcheck is healthy.
- `restart: true` under `depends_on.db` restarts `php` when `db` is restarted by Compose.
- MySQL instead of MariaDB: `image: mysql:8.4`, `MYSQL_*` variables, healthcheck `["CMD", "mysqladmin", "ping", "-h", "127.0.0.1"]`, client tools `mysql` / `mysqldump`.
- Need a DB GUI on the host? Add `ports: ["127.0.0.1:3306:3306"]` to `db` locally (e.g. in an uncommitted `compose.override.yaml`), never a bare `3306:3306`.

## 4. `.env` and a new project

```dotenv
# .env.example: copy to .env and fill in; .env is git-ignored
COMPOSE_PROJECT_NAME=my-site
PHP_VERSION=8.4
WEB_PORT=8080
DB_NAME=drupal
DB_USER=drupal
DB_PASSWORD=
DB_ROOT_PASSWORD=
LOCAL_UID=1000
LOCAL_GID=1000
```

Fill the IDs from the host: `printf 'LOCAL_UID=%s\nLOCAL_GID=%s\n' "$(id -u)" "$(id -g)" >> .env` (last value wins). Do not rely on `${UID}`: in bash it is a shell variable that is not exported, so Compose does not see it. Inspect the interpolated result with `docker compose config`.

### New project from scratch

`composer create-project` needs an empty target, and the project root already holds `compose.yaml` and `docker/`: create into a temporary folder inside the container, then copy.

```bash
docker compose up -d --wait db redis
docker compose run --rm --no-deps php sh -c \
  'composer create-project "drupal/recommended-project:^11" /tmp/site && cp -a /tmp/site/. /var/www/html/'
docker compose up -d --wait
docker compose exec php composer require "drush/drush:^13"
docker compose exec php sh -c 'drush site:install --db-url="mysql://$DB_USER:$DB_PASSWORD@$DB_HOST:3306/$DB_NAME" --account-name=admin --account-pass=admin -y'
```

`site:install` writes the DB credentials into `settings.php`: move them to the git-ignored `settings.local.php` (section 7) before the first commit.

## 5. PHP image and ini

```dockerfile
# docker/php/Dockerfile
ARG PHP_VERSION=8.4
FROM php:${PHP_VERSION}-fpm-trixie

RUN apt-get update && apt-get install -y --no-install-recommends \
      git unzip mariadb-client \
      libfreetype-dev libjpeg62-turbo-dev libpng-dev libwebp-dev libzip-dev libicu-dev \
  && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
  && docker-php-ext-install -j"$(nproc)" gd pdo_mysql zip intl opcache \
  && pecl install redis apcu \
  && docker-php-ext-enable redis apcu \
  && rm -rf /var/lib/apt/lists/*

# Development defaults, then our overrides (loaded after, so they win)
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"
COPY docker/php/conf.d/drupal.ini "$PHP_INI_DIR/conf.d/zz-drupal.ini"

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
ENV PATH="/var/www/html/vendor/bin:${PATH}"
```

```ini
; docker/php/conf.d/drupal.ini
memory_limit = 512M
upload_max_filesize = 64M
post_max_size = 64M
max_execution_time = 120
opcache.validate_timestamps = 1
opcache.revalidate_freq = 0
```

- `mariadb-client` is needed in the PHP container for `drush sql:*` (Drush 13 uses the `mariadb` binaries when the server is MariaDB).
- On PHP 8.5 OPcache is part of core: drop `opcache` from `docker-php-ext-install` if the build complains.
- After editing the Dockerfile or the ini: `docker compose up -d --build php`. Check with `docker compose exec -T php php -i | grep memory_limit`.

## 6. nginx server block

Adapted from the nginx Drupal recipe (nginx wiki), PHP-FPM on `php:9000`:

```nginx
# docker/nginx/default.conf
server {
    listen 80;
    server_name _;
    root /var/www/html/web;
    client_max_body_size 64m;

    location = /favicon.ico { log_not_found off; access_log off; }
    location = /robots.txt  { allow all; log_not_found off; access_log off; }

    location ~ \..*/.*\.php$ { return 403; }
    location ~ ^/sites/.*/private/ { return 403; }
    location ~ ^/sites/[^/]+/files/.*\.php$ { deny all; }
    location ~* ^/.well-known/ { allow all; }
    location ~ (^|/)\. { return 403; }
    location ~ /vendor/.*\.php$ { deny all; return 404; }

    # Protect source and config files (module .yml, .install, .twig, dumps, backups)
    location ~* \.(engine|inc|install|make|module|profile|po|sh|.*sql|theme|twig|tpl(\.php)?|xtmpl|yml)(~|\.sw[op]|\.bak|\.orig|\.save)?$|^(\.(?!well-known).*|Entries.*|Repository|Root|Tag|Template|composer\.(json|lock)|web\.config)$|^#.*#$|\.php(~|\.sw[op]|\.bak|\.orig|\.save)$ {
        deny all;
        return 404;
    }

    location / {
        try_files $uri /index.php?$query_string;
    }
    location @rewrite {
        rewrite ^ /index.php;
    }

    location ~ '\.php$|^/update.php' {
        fastcgi_split_path_info ^(.+?\.php)(|/.*)$;
        try_files $fastcgi_script_name =404;
        include fastcgi_params;
        fastcgi_param HTTP_PROXY "";
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $fastcgi_path_info;
        fastcgi_param QUERY_STRING $query_string;
        fastcgi_intercept_errors on;
        fastcgi_pass php:9000;
    }

    # Image styles and aggregated CSS/JS are generated by Drupal on first request
    location ~ ^/sites/.*/files/styles/ { try_files $uri @rewrite; }
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff2?)$ {
        try_files $uri @rewrite;
        expires max;
        log_not_found off;
    }

    # Private files through Drupal (optional language prefix)
    location ~ ^(/[a-z\-]+)?/system/files/ {
        try_files $uri /index.php?$query_string;
    }
}
```

## 7. Drupal settings for containers

Keep the committed `settings.php` generic and include a git-ignored local file (Drupal ships `sites/example.settings.local.php`; the include block is at the bottom of `default.settings.php`):

```php
// web/sites/default/settings.local.php
$databases['default']['default'] = [
  'driver' => 'mysql',
  'database' => getenv('DB_NAME'),
  'username' => getenv('DB_USER'),
  'password' => getenv('DB_PASSWORD'),
  'host' => getenv('DB_HOST') ?: 'db',
  'port' => 3306,
  'prefix' => '',
];
$settings['trusted_host_patterns'] = ['^localhost$', '^127\.0\.0\.1$'];
```

The DB host is the **service name** (`db`), never `localhost`: inside the PHP container `localhost` is the PHP container itself. Hash salt, reverse proxy and production hardening → `drupal11-devops-testing-security`.

## 8. Redis

1. `redis` service with healthcheck and no published port (section 3); phpredis in the PHP image (`pecl install redis`, section 5).
2. Module: `docker compose exec php composer require drupal/redis` then `docker compose exec php drush en redis -y`.
3. Settings: the module ships `settings.redis.example.php` (cache default, compression, `container_yamls` for `example.services.yml` and `redis.services.yml`, Redis-backed container cache). Copy it and include it, overriding only the host:

```bash
cp web/modules/contrib/redis/settings.redis.example.php web/sites/default/settings.redis.php
```

```php
// settings.php (or settings.local.php)
if (file_exists($app_root . '/' . $site_path . '/settings.redis.php')) {
  include $app_root . '/' . $site_path . '/settings.redis.php';
  $settings['redis.connection']['host'] = getenv('REDIS_HOST') ?: 'redis';
}
```

The example file does nothing during installation or when the `redis` extension is missing, so it is safe to commit. Verify with `docker compose exec redis redis-cli INFO keyspace` after browsing a few pages, or at `/admin/reports/redis`. Which bins to put where → `drupal11-performance-caching`.

## 9. Database operations

Use `-T` on every `exec` that is piped, and run the pipes in **bash with `pipefail`**: a pipeline returns the status of its last command, so a failed `mariadb-dump | gzip` otherwise produces an empty but valid `.gz` with exit code 0, and a truncated archive can be half-imported with exit code 0. Credentials come from the DB container's own environment, so nothing ends up in your shell history. The subshell `( … )` keeps `set -e` from closing your interactive shell.

```bash
# Export (MariaDB): write to a temporary file, check it, rename only on success
(
  set -euo pipefail
  out=dump.sql.gz; part="$out.part"
  trap 'rm -f "$part"' EXIT
  docker compose exec -T db sh -c \
    'exec mariadb-dump -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" --single-transaction "$MARIADB_DATABASE"' \
    | gzip > "$part"
  gzip -cd "$part" | tail -n 1 | grep -q '^-- Dump completed'   # mariadb-dump's end marker
  mv "$part" "$out"
)

# Import (MariaDB): validate the archive first, then stream with pipefail
(
  set -euo pipefail
  gzip -t dump.sql.gz            # fails on a truncated/corrupted archive, before touching the DB
  gzip -cd dump.sql.gz \
    | docker compose exec -T db sh -c 'exec mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"'
)

# Interactive client (TTY wanted here, no -T)
docker compose exec db sh -c 'mariadb -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DATABASE"'

# Via Drush, from the PHP container (Drush writes the file itself: no host pipe)
docker compose exec php drush sql:dump --gzip --result-file=../dump.sql   # path relative to the docroot → dump.sql.gz in the project root
docker compose exec php drush sql:cli
```

The end-marker check relies on the default dump comments; drop that line if you dump with `--skip-comments`. MySQL images: `mysqldump` / `mysql` with `MYSQL_*` variables, same `-T` rule. PostgreSQL: `pg_dump` / `psql` with `POSTGRES_*`. After an import: `docker compose exec php drush deploy -y`. A full reset is `docker compose down -v` (deletes `db-data`): export first.

## 10. Permissions (UID mapping)

The official PHP-FPM image runs workers as `www-data` (UID 33), while bind-mounted files belong to your host user: Drupal cannot write `sites/default/files`, or files it writes become root/www-data owned on the host. The image docs recommend running FPM as an arbitrary user via `--user`; in Compose that is `user: "${LOCAL_UID}:${LOCAL_GID}"` on the `php` service (section 3), with `COMPOSER_HOME` pointed at a writable path. Then:

- no `chown` inside containers; if earlier runs left root-owned files, fix them once on the host: `sudo chown -R "$(id -u):$(id -g)" web/sites/default/files`;
- nginx only reads the mount (`:ro`), so it does not need write access;
- on Docker Desktop (macOS/Windows) ownership is translated by the VM; the `user:` line is harmless there.

## 11. Mail and Xdebug

**Mail.** PHP images have no MTA, so Drupal's default `php_mail` fails. Point Drupal at Mailpit with the core (experimental) Symfony mailer plugin in `settings.local.php`, then read mail at `http://127.0.0.1:8025`:

```php
$config['system.mail']['interface'] = ['default' => 'symfony_mailer'];
$config['system.mail']['mailer_dsn'] = [
  'scheme' => 'smtp', 'host' => 'mailpit', 'port' => 1025,
  'user' => NULL, 'password' => NULL, 'options' => [],
];
```

**Xdebug.** Build it only for development (an extra `RUN pecl install xdebug && docker-php-ext-enable xdebug`, e.g. behind a build arg) and add an ini:

```ini
xdebug.mode = debug
xdebug.start_with_request = trigger
xdebug.client_host = host.docker.internal
xdebug.client_port = 9003
```

On Linux `host.docker.internal` needs the `extra_hosts: host-gateway` entry (section 3). IDE path mapping: project root → `/var/www/html`.

## 12. Command wrappers

A thin `Makefile` (or `justfile`) documents the team's commands and hides service names:

```makefile
# A failed command anywhere in a pipe must fail the recipe
SHELL := bash
.SHELLFLAGS := -eu -o pipefail -c

DB_SH = docker compose exec -T db sh -c

.PHONY: up down build shell drush composer logs db-export db-import
up:        ; docker compose up -d --wait
down:      ; docker compose down
build:     ; docker compose up -d --build --wait
shell:     ; docker compose exec php bash
logs:      ; docker compose logs -f
drush:     ; docker compose exec php drush $(filter-out $@,$(MAKECMDGOALS))
composer:  ; docker compose exec php composer $(filter-out $@,$(MAKECMDGOALS))

db-export:
	$(DB_SH) 'exec mariadb-dump -u"$$MARIADB_USER" -p"$$MARIADB_PASSWORD" --single-transaction "$$MARIADB_DATABASE"' | gzip > dump.sql.gz.part
	gzip -cd dump.sql.gz.part | tail -n 1 | grep -q '^-- Dump completed'
	mv dump.sql.gz.part dump.sql.gz

db-import:
	test -n "$(file)" || { echo "usage: make db-import file=dump.sql.gz" >&2; exit 2; }
	gzip -t "$(file)"
	gzip -cd "$(file)" | $(DB_SH) 'exec mariadb -u"$$MARIADB_USER" -p"$$MARIADB_PASSWORD" "$$MARIADB_DATABASE"'

%:
	@:
```

Usage: `make up`, `make drush cr`, `make composer require drupal/admin_toolbar`, `make db-export`, `make db-import file=dump.sql.gz`. (`$$` escapes `$` for make so the variables expand inside the DB container.) A failed export stops before the `mv`, so `dump.sql.gz` is never replaced by a broken file; a leftover `dump.sql.gz.part` is safe to delete.

## 13. File sync performance

- **Linux**: bind mounts are native; nothing to tune.
- **macOS / Windows (Docker Desktop)**: keep the default VirtioFS file sharing; for large codebases Docker Desktop's *Synchronized file shares* (paid plans) helps most. Consistency flags (`:cached`, `:delegated`) are not documented for current Docker Desktop and the Compose spec calls them platform-specific: do not rely on them.
- Heavy generated trees (`node_modules`, sometimes `vendor`) can live in a named volume mounted over the bind mount; the trade-off is that the host (and your IDE) no longer sees them.
- On Windows keep the project inside the WSL2 filesystem, not under `/mnt/c`.
- If performance on macOS is still poor, DDEV with Mutagen is the supported alternative ([ddev.md](ddev.md)).

## 14. Compose-specific troubleshooting

```bash
docker compose config                  # interpolated file: typos, missing .env values
docker compose ps                      # state and health of each service
docker inspect --format '{{json .State.Health}}' "$(docker compose ps -q db)"   # why unhealthy
docker compose logs --tail 100 php
docker compose exec php getent hosts db redis   # service name resolution
docker compose exec -T php php -m | grep -Ei 'redis|gd|pdo_mysql|apcu'
docker compose port web 80             # host port actually bound
```

- "port is already allocated": another container or host service holds the host port; change the left side of `ports:` or stop the other project (`docker ps --format '{{.Names}}\t{{.Ports}}'`).
- Service healthy but Drupal says "connection refused": wrong host (`localhost` instead of `db`) or wrong credentials in `.env` (a DB volume initialised with old credentials keeps them: fix the user in the DB or recreate the volume after exporting).
- Changes to `compose.yaml` need `docker compose up -d` (recreates changed services); Dockerfile/ini changes need `--build`.
