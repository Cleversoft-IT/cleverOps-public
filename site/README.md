# cleverOps — sito

Mini-sito vetrina delle skill/agent DevOps·AI di Cleversoft, costruito col design system
`cleversoft-design-system`. Next.js 16 + Tailwind 4.

Il catalogo è **generato dai manifest veri**: `scripts/generate-skills.mjs` legge
`../skills/*/SKILL.md` e `../agents/*.md` e scrive `data/skills.generated.json`
(eseguito in automatico da `predev` / `prebuild`).

## Sviluppo

```bash
cd site
npm install
npm run dev      # genera i dati + avvia su http://localhost:3000
```

## Build

```bash
npm run build    # prebuild (genera dati) + next build
npm start
```

## Deploy su Vercel

Il sito vive in `site/`, quindi su Vercel imposta **Root Directory = `site`**.

- Framework preset: **Next.js** (autodetect).
- Build command: `npm run build` (default).
- Il `prebuild` legge `../skills` e `../agents`: Vercel fa il checkout dell'intero repo,
  quindi i path relativi funzionano in fase di build.

CLI:

```bash
npm i -g vercel
cd site
vercel            # primo deploy (preview) — chiede di impostare la root
vercel --prod     # produzione
```

## Provare impeccable su questo sito

Con il dev server attivo, dentro una sessione Claude Code in questa cartella:

```
/impeccable critique la home
/impeccable polish le card skill
/impeccable live            # varianti in-browser
```
