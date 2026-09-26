<div align="center">

```
        _                       ___
   ____| | _____   _____ _ __  / _ \ _ __  ___
  / ___| |/ _ \ \ / / _ \ '__|| | | | '_ \/ __|
 | (__ | |  __/\ V /  __/ |   | |_| | |_) \__ \
  \___|_|\___| \_/ \___|_|    \___/| .__/|___/
                                   |_|
```

**La toolbox AI/DevOps di Cleversoft IT** · _skill e tool per Claude Code e Codex_

![Claude Code](https://img.shields.io/badge/Claude_Code-✓-blue?style=flat-square)
![Codex](https://img.shields.io/badge/Codex-✓-blue?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)

</div>

---

## Installa

Serve Node ≥ 18. Dentro Claude Code (col `!` davanti per eseguirlo nella shell):

```bash
! npx github:Cleversoft-IT/cleverOps-public --all --target claude,codex
```

In un terminale interattivo, ometti i flag per scegliere skill e destinazioni nella TUI.
Il pacchetto non è su npm:
`npx` lo scarica direttamente da questo repo pubblico.

| Voglio… | Comando |
|---|---|
| Scegliere a mano | `npx github:Cleversoft-IT/cleverOps-public` |
| Tutto, per Claude Code e Codex | `… --target claude,codex --all` |
| Tutto, solo in questo progetto | `… --target project --project . --all` |
| Solo alcune skill | `… --target claude,codex --skills plan-auditor,transcribe-local` |
| Disinstallare | `… uninstall --target claude,codex --all` |

<sub>`…` = `npx github:Cleversoft-IT/cleverOps-public`</sub>

## Plugin marketplace

Claude Code e Codex hanno cataloghi generati da `cleverops.json`, con un plugin
per skill e solo le risorse compatibili con ciascun host. Il marketplace pubblico
si chiama `cleverops-public`; chi ha accesso può aggiungere anche `cleverops-internal`.

Seguire la [guida marketplace](docs/marketplace.md) per **aggiunta e installazione**
del plugin, cambio canale con `sync`, controllo con `doctor` e nuova sessione.
La guida descrive anche il ritorno ai file, i namespace e gli aggiornamenti.
Per rigenerare: `npm run marketplace:generate`; per il controllo CI:
`npm run marketplace:check`.

## Cosa c'è dentro

| Skill | In una riga |
|---|---|
| `drupal11-*` (7 skill) | Drupal 11.4: moduli, query/Views, configurazione, cache, theming, deploy/test/sicurezza, migrazioni ([dettagli](docs/drupal11/README.md)) |
| `drupal-local-env` | Ambiente di sviluppo locale Drupal: DDEV o Docker Compose |
| `ionic-capacitor-app` | App Ionic 9 + Capacitor 8 (Angular, React, Vue): base, navigazione, push, i18n; acquisti, annunci e onboarding solo se richiesti |
| `plan-auditor` | Revisione dei piani di implementazione prima di scrivere codice (Codex) |
| `subagent-dev-with-codex` | Loop cross-model: Claude scrive il piano, Codex lo audita (Claude Code) |
| `transcribe-local` | Audio → testo con Whisper in locale, senza servizi esterni |

Il catalogo aggiornato è anche sul sito. Chi ha accesso al repo privato del team vede
nell'installer anche le skill interne, marcate ⟨interno⟩: l'accesso si verifica con le tue
credenziali git, senza prompt.

## Opzioni dell'installer

| Flag | Effetto |
|---|---|
| `--target claude,codex,project` | dove installare (`project` → `<dir>/.claude/`) |
| `--project PATH` | cartella del progetto (default: cwd) |
| `--all` · `--skills a,b` | cosa installare |
| `--copy` / `--from PATH --link` | copia (default) o symlink da una sorgente locale esplicita |
| `--list [--json]` | catalogo delle sorgenti accessibili |
| `--source ID` / `--no-private` | seleziona una sorgente o esclude il privato |
| `--verbose` | mostra anche i motivi delle sorgenti saltate |
| `--impeccable` | installa [impeccable](https://impeccable.style) (dipendenza esterna) |
| `--ccstatusline` | installa la statusline [ccstatusline-gradient](https://github.com/akkaz/ccstatusline-gradient) |

Le skill Codex sono installate in `~/.agents/skills`. `doctor` diagnostica senza
scritture, `sync` riconcilia migrazioni e plugin, `uninstall` usa il registro offline.
Vedi la [guida dell’installer](docs/installer.md) per cache, backup, agent e test.

## Struttura

```
bin/        installer TUI (Node + Ink)
skills/     le skill (SKILL.md, per Claude Code e Codex)
extras/     script della demo (GIF della TUI)
site/       sito vetrina (Next.js)
scripts/    guardie di riservatezza e provenienza (vedi sotto)
```

## Contribuire e sicurezza

Questo repo è pubblico; il materiale aziendale vive in un repo privato separato.
Per evitare fughe di dati:

- **Una volta per clone**, e di nuovo quando cambiano le guardie (gli hook lo segnalano):
  `bash scripts/setup-hooks.sh`. Installa gli hook `pre-commit` e `pre-push` in una copia
  fissa dentro `.git/`, attiva su qualunque branch (anche orphan), che eseguono `gitleaks`, `scripts/check-public.mjs` (contenuti riservati) e
  `scripts/check-provenance.mjs` (la storia deve discendere dal commit iniziale di questo
  repo). La denylist dei termini riservati è un file locale, mai committato.
- **Branch di lavoro**: solo `work/**`; `main` accetta solo PR con i check `provenance`,
  `public-guard` e `gitleaks` verdi.
- **PR da fork**: il check `public-guard` fallisce per scelta (non ha accesso alla
  denylist). Un maintainer rivede la PR, la scansiona in locale e ne porta lo snapshot
  approvato su un branch `work/fork-<n>`: si integra quella PR, l'originale si chiude
  con un riferimento.
- **Se qualcosa di riservato viene pubblicato per errore** è un incidente: cancellare il
  branch non basta, perché i commit restano raggiungibili. Avvisa subito i maintainer.

Per segnalazioni private e gestione degli incidenti vedi [SECURITY.md](SECURITY.md).

### Riprodurre la CI

Dalla radice, con Node 22 (ripetere i test dell'installer anche con Node 18):

```bash
npm ci
node scripts/validate-skills.mjs
npm test
bash scripts/check-scripts.sh
```

`npm test` comprende il packaging con `npm pack`, l'installazione dal tarball senza
`.git`, le migrazioni con fixture sintetiche e i test del controllo di deploy.
In CI gira su Ubuntu e macOS con Node 18 e 22. `check-scripts.sh` verifica la sintassi
Bash e Python e lancia ShellCheck (errori e warning), se installato. Per validare i workflow puoi usare
anche `actionlint`, se disponibile.

La validazione delle skill non richiede dipendenze: controlla frontmatter, corrispondenza
con il manifest, percorsi fissi e formato/ordinamento degli hash legacy. Accetta YAML
con stringhe semplici o quotate (escape JSON), descrizioni multilinea e blocchi `|`/`>`,
`compatibility` come stringa opzionale, `allowed-tools` come stringa o lista,
`metadata` come mappa di stringhe. Alias, tag e
strutture più complesse sono rifiutati esplicitamente: usare queste forme standard.
Oltre 500 righe emette un avviso; gli hash legacy si rigenerano esclusivamente nel
repository privato, mai nella CI pubblica.

Per il sito, con Node 22:

```bash
cd site
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Il catalogo JSON viene rigenerato dal manifest durante typecheck e build; i suoi
contenuti sono verificati dai test del generatore. L'export statico è in `site/out`.
Le guardie di riservatezza si riproducono tramite gli hook configurati sopra; i
controlli sintattici e i test non sostituiscono la denylist locale e Gitleaks.

Gli aggiornamenti settimanali delle dipendenze arrivano da Dependabot
(`.github/dependabot.yml`) in PR raggruppate su branch `dependabot/**`, che il ruleset
ammette insieme a `work/**`. Nelle PR di Dependabot i secret Actions non sono
disponibili: `public-guard` usa la copia della denylist salvata come secret
**Dependabot** `PUBLIC_GUARD_DENYLIST`, da aggiornare insieme a quella Actions.
Le guardie restano obbligatorie anche per queste PR.

### Deploy automatico del sito

Il progetto Cloudflare Pages `cleverops` deve già esistere, con branch di produzione
`main`. Configurare i secret GitHub `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN`:
il token deve avere solo **Cloudflare Pages: Edit** sull'account del progetto.
Senza uno dei secret il workflow spiega il motivo e il job di deploy viene saltato.

`deploy-site.yml` ascolta il completamento di entrambi i workflow `ci` e `guards`:
il primo che termina può attendere, il secondo rivaluta i requisiti. Pubblica solo
dopo il successo di entrambi sulla stessa revisione, verificando anche i singoli
job `site`, `provenance`, `public-guard` e `gitleaks`. Usa l'artifact identificato
dal run e dal tentativo CI verificati; un nuovo tentativo fallito non può riusare
un verde precedente. La concorrenza per ref serializza i deploy senza annullare
quello in corso; un secondo deploy della stessa revisione è idempotente.

Per ripetere la CI destinata al deploy usare **Re-run all jobs**.
Con **Re-run failed jobs**, il job `site` già riuscito non viene rieseguito e non
rigenera l'artifact con il numero del nuovo tentativo: il deploy non parte.

La produzione accetta soltanto push al commit corrente di `main`; le anteprime
usano `pr-NUMERO` e richiedono una PR aperta dello stesso repository con la testa
ancora corrispondente ai controlli. Un avanzamento della base non invalida
l'anteprima: l'artifact è legato al run e allo SHA verificati.
I fork non vengono pubblicati. Il controllo
privilegiato viene letto da `main`, e il job di deploy scarica solo l'export statico,
senza eseguire codice o installazioni npm della PR. Prima della pubblicazione con
Wrangler `4.141.0`, il workflow rifiuta `_worker.js`, `functions/` e `_routes.json`
nell'export; `_headers` e `_redirects` sono ammessi. `workflow_run` si attiva quando
il workflow è presente sul branch predefinito: il primo collaudo remoto avviene
dopo l'integrazione su `main` e la configurazione dei secret.

## Licenza

[MIT](LICENSE) © Cleversoft IT
