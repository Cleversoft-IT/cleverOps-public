# cleverOps — sito

Sito vetrina del catalogo cleverOps: Next.js 16 con **export statico** + Tailwind 4,
pubblicato su **Cloudflare Pages** all'indirizzo <https://cleverops.cleversoft.it>.
Non c'è alcun server: `next build` produce HTML, CSS e JS in `out/`.

## Da dove arrivano i dati

Il catalogo è **generato dai manifest veri**: `scripts/generate-skills.mjs` legge
`../cleverops.json` (contratto in [`../docs/manifest.md`](../docs/manifest.md)), le
`../skills/*/SKILL.md` e gli eventuali `../agents/*.md`, e scrive `data/skills.generated.json`.

- Entrano solo le voci con visibilità `public`.
- Categoria, harness (`targets`) e stato `legacy` vengono dal manifest; nome e descrizione dal
  frontmatter YAML delle skill.
- Il repository mostrato nei comandi (`npx github:<owner>/<repo>`) viene da `repository.url` del
  `package.json` alla radice.
- Il manifest viene validato per intero contro il contratto (`schemaVersion`, `id`, `visibility`,
  `skills`/`agents`, `category`, `targets`, `legacy`, `replaces`, `requires`) prima di costruire i
  comandi; poi si confronta con le cartelle (voce senza cartella, cartella senza voce, `name` del
  frontmatter diverso). Tutti gli errori escono in un unico messaggio e il build si ferma.
- Il JSON generato **non è versionato**: lo rigenerano `predev`, `prebuild` e `pretypecheck`
  (oppure `npm run generate`). Il build va quindi lanciato da un checkout completo del repo.

I componenti non citano skill per nome: il sito funziona con qualunque insieme di skill del
manifest, e sezione, voce di menu e testi sugli agent compaiono solo se il catalogo ne contiene.

## Requisiti

- Node.js ≥ 20.9.
- Nessun accesso alla rete durante il build: DM Sans è servita da file locale
  (`src/fonts/`, licenza SIL OFL 1.1 in `src/fonts/DMSans-OFL.txt`), Geist Mono arriva dal
  pacchetto npm `geist`.

## Sviluppo

```bash
cd site
npm ci
npm run dev        # genera i dati + avvia su http://localhost:3000
```

## Controlli

```bash
npm run lint       # eslint . (flat config con eslint-config-next)
npm run typecheck  # genera i dati + tsc --noEmit
npm test           # node --test: validazione del manifest nel generatore
npm run build      # genera i dati + next build → out/
```

## Build statico

`npm run build` scrive il sito in `out/`. Con `trailingSlash` ogni pagina è una cartella con il
suo `index.html` (`out/index.html`, `out/come-funziona/index.html`), quindi funziona su qualunque
hosting statico. Anteprima locale:

```bash
python3 -m http.server -d out 8080   # poi http://localhost:8080
```

## Deploy su Cloudflare Pages

Il contenuto di `out/` si pubblica sul progetto Pages `cleverops` con Wrangler 4, indicando
sempre l'account in modo esplicito:

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=<id-account> npx wrangler@4 pages deploy out \
  --project-name cleverops --branch main          # produzione
CLOUDFLARE_ACCOUNT_ID=<id-account> npx wrangler@4 pages deploy out \
  --project-name cleverops --branch pr-<n>        # anteprima
```

Il dominio `cleverops.cleversoft.it` punta con un CNAME al sottodominio `*.pages.dev` del
progetto.

## Provare impeccable su questo sito

Con il dev server attivo, dentro una sessione Claude Code in questa cartella:

```
/impeccable critique la home
/impeccable polish le card skill
/impeccable live            # varianti in-browser
```
