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

## Cosa c'è dentro

| Skill | In una riga |
|---|---|
| `drupal11-*` (7 skill) | Drupal 11.4: moduli, query/Views, configurazione, cache, theming, deploy/test/sicurezza, migrazioni ([dettagli](docs/drupal11/README.md)) |
| `drupal-local-env` | Ambiente di sviluppo locale Drupal: DDEV o Docker Compose |
| `ionic-skills` | App Ionic/Capacitor (in riscrittura come `ionic-capacitor-app`) |
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
| `--toolbelt` | installa i CLI consigliati (rg, fd, tree, ast-grep, gh) |
| `--impeccable` | installa [impeccable](https://impeccable.style) (dipendenza esterna) |
| `--ccstatusline` | installa la statusline [ccstatusline-gradient](https://github.com/akkaz/ccstatusline-gradient) |

Le skill Codex sono installate in `~/.agents/skills`. `doctor` diagnostica senza
scritture, `sync` riconcilia migrazioni e plugin, `uninstall` usa il registro offline.
Vedi la [guida dell’installer](docs/installer.md) per cache, backup, agent e test.

## Struttura

```
bin/        installer TUI (Node + Ink)
skills/     le skill (SKILL.md, per Claude Code e Codex)
extras/     toolbelt CLI e script della demo
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

## Licenza

[MIT](LICENSE) © Cleversoft IT
