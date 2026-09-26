# Secure coding checklist for Drupal 11 custom code

Companion to `../SKILL.md` (security section). Use it while writing code and as a review checklist before merging. APIs verified on Drupal 11.4.

## 1. Output and XSS

| Value | Output with |
|---|---|
| Untrusted plain text (names, titles, query params) | `['#plain_text' => $value]`, or a Twig variable (autoescaped) |
| User-authored rich text | `['#type' => 'processed_text', '#text' => $value, '#format' => $format_id]` |
| Trusted/admin HTML you build | `['#markup' => ...]` — filtered with `Xss::filterAdmin()` (or `#allowed_tags`) |
| HTML string you must filter by hand | `Xss::filter($html)` (restrictive) / `Xss::filterAdmin($html)` |
| Translatable strings with variables | `$this->t('Hi @name', ['@name' => $name])` — `@` escapes, `%` escapes + `<em>`, `:` escapes + strips dangerous URL protocols |

Rules:

- Twig autoescapes everything that is not a `MarkupInterface`. **`|raw` never goes on user-derived data.**
- `Markup::create()` does **not** sanitize: it declares a string safe. Only for markup you generated or verified; never around input.
- Attributes: build them with `Attribute` / `create_attribute()` so values are escaped; never concatenate `on*=` handlers or `javascript:` URLs.
- `check_markup()` is deprecated in 11.4 — use the `processed_text` element so cacheability of the text format bubbles.
- JavaScript: pass data with `drupalSettings` (`#attached['drupalSettings']`), read it in JS, and insert it with `textContent` / `Drupal.checkPlain()`, not `innerHTML`.

## 2. CSRF outside Form API

Form API forms (including their `#ajax` callbacks) carry a `form_token` automatically — **only for authenticated users**: tokens are session-bound, so `FormBuilder` adds none to forms shown to anonymous users (they are usually cached), and none when a form sets `#token => FALSE`. Everything else that **changes state** needs all three of: an appropriate method, an effective CSRF check, and authorization.

1. **Method**: state changes use `POST` / `PATCH` / `DELETE` (`methods: [POST]` in `*.routing.yml`). A POST alone is **not** CSRF protection — a cookie-authenticated POST can be forged by another site.
2. **CSRF check for non-GET routes called by JS / REST with cookie sessions**: `_csrf_request_header_token: 'TRUE'`; the client fetches a token from `/session/token` and sends it in `X-CSRF-Token`. This check does **not** run for GET, HEAD, OPTIONS, TRACE, and it **always passes for anonymous users** (it only applies to authenticated requests with a session cookie) — so it never replaces an access requirement.
3. **Actions that must be triggered by a GET link** (only when unavoidable): `_csrf_token: 'TRUE'` on the route; `Url::fromRoute()` / `Link` append `?token=…` and `CsrfAccessCheck` validates it — never build these URLs by string concatenation. This check **fails for users without an active session** (most anonymous users), so it is for authenticated actions only.
4. **Custom tokens** bound to the current session: the `csrf_token` service (`CsrfTokenGenerator`) — `$token = $this->csrfToken->get($value)` and `$this->csrfToken->validate($token, $value)`.
5. **Links for users without a session** (e.g. an action link in an email): a **signed, time-limited link** — HMAC over the action, the target ids and a timestamp with a key derived from `Settings::getHashSalt()`, verified with `hash_equals()` and an expiry. That is not single-use by itself. To make it **one-time**, either consume a stored nonce atomically (delete/flag it in the same transaction as the action) or sign data that the action itself changes, so the signature stops matching afterwards — core's `Drupal\user\OneTimeAuthentication` signs the account's last login time, email and password hash for exactly this reason.
6. **Authorization** on every route (`_permission`, `_entity_access`, custom access) — a token is not authorization.

```yaml
my_module.item_delete:
  path: '/my-module/item/{item}/delete'
  methods: [POST]
  defaults:
    _controller: '\Drupal\my_module\Controller\ItemController::delete'
  requirements:
    _entity_access: 'item.delete'
    _csrf_request_header_token: 'TRUE'
```

## 3. File uploads

- Validators are constraint plugins (since 10.2; `file_validate_*()` functions are removed in D11). IDs and options:
  `FileExtension` (`extensions: 'pdf docx'`), `FileExtensionSecure` (blocks executable extensions unless `system.file:allow_insecure_uploads` is on — keep it `false`), `FileSizeLimit` (`fileLimit`, `userLimit` in bytes), `FileIsImage`, `FileImageDimensions` (`maxDimensions`, `minDimensions` as `'WxH'`), `FileNameLength` (`maxLength`), `FileEncoding` (`encodings`).
- Form element:

  ```php
  $form['attachment'] = [
    '#type' => 'managed_file',
    '#title' => $this->t('Attachment'),
    '#upload_location' => 'private://my_module/attachments',
    '#upload_validators' => [
      'FileExtension' => ['extensions' => 'pdf'],
      'FileSizeLimit' => ['fileLimit' => 5 * 1024 * 1024],
    ],
  ];
  ```

- Programmatic files: inject `Drupal\file\Validation\FileValidatorInterface` (`file.validator`) and check `count($this->fileValidator->validate($file, $validators))` before saving; for raw uploads use `Drupal\file\Upload\FileUploadHandlerInterface::handleFileUpload()` with the same validator array.
- Drupal guesses the MIME type **from the extension**. When the content matters, validate it: `FileIsImage` for images (the image toolkit must parse it), `finfo` checks for other types, and refuse SVG/HTML unless sanitized.
- Store non-public uploads under `private://` (served only through access-checked routes / `hook_file_download()`), never in `public://`.
- Set limits on the field too (allowed extensions, max size, directory with tokens) so every upload path is covered, not only your form.

## 4. Logging and errors

- Use the logger with placeholders: `$this->logger->warning('Import failed for @id', ['@id' => $id])` — never interpolate into the message.
- **Never log secrets or personal data**: passwords, API keys, tokens, session IDs, full request/response bodies, `$_SERVER`/headers dumps. Log identifiers instead.
- Production: `$config['system.logging']['error_level'] = 'hide';` (the default), no Devel/Kint/Webprofiler, no `settings.local.php` include.
- Exceptions shown to users carry a generic message; details go to the log. Do not echo SQL errors or stack traces in responses.
- Secrets live outside the repo (environment, `settings.php` reading a file or env var) and are read through `Settings::get()` / config overrides — never in exported config YAML.

## 5. Deserialization and other untrusted input

- Never `unserialize()` data that crossed a trust boundary (request, cookie, queue from outside, third-party API). If PHP serialization is unavoidable on internal data, pass `['allowed_classes' => FALSE]` or an explicit class list.
- Exchange data as JSON: `Drupal\Component\Serialization\Json::decode()`, then validate shape and types before use.
- Database: placeholders and query builders only (see the SQL section of `../SKILL.md`); dynamic table/column names go through an allow-list or `$connection->escapeField()` / `escapeTable()`.
- Outbound HTTP to user-supplied URLs: allow-list hosts and schemes (SSRF), set timeouts on the `http_client` request.
- Shell: avoid `exec()`/`shell_exec()`; if unavoidable use Symfony Process with an argument array.
- Redirects to user-supplied destinations: use `?destination=` handling of core (it rejects external URLs) or `UrlHelper::isExternal()` checks.

## 6. Review checklist

- [ ] Every output path escapes or filters (no `|raw` / `Markup::create()` on input).
- [ ] Every state-changing route has all three: an appropriate method (POST/PATCH/DELETE; GET only when unavoidable and then with `_csrf_token`), an effective CSRF check for the users who can call it (`form_token`, `_csrf_request_header_token`, `_csrf_token`, or a signed link — remember the first two do nothing for anonymous users), and an access requirement.
- [ ] Access results carry cacheability (`cachePerPermissions()`, `addCacheableDependency()`).
- [ ] Entity queries declare `accessCheck()`; SQL uses placeholders.
- [ ] Uploads have extension + size validators, private storage when not public, content checks where needed.
- [ ] No secrets or personal data in logs, config exports, fixtures or test data.
- [ ] No `unserialize()` of untrusted data.
- [ ] Security advisories for used contrib modules checked (`composer audit`, drupal.org SA feed).
