# Suite `drupal11-*`

Le sette skill `skills/drupal11-*` di questo repo formano una suite per lo sviluppo su Drupal 11,
scritta in inglese come le altre skill tecniche.

## Provenienza

- Origine: la suite **drupal11-skills** di Stefano (cleversoft.it), rilasciata con licenza MIT,
  versione **v11.3.0** (28 aprile 2026, baseline Drupal 11.3). Le sei skill originali sono state
  importate qui senza cambiare nome né licenza.
- Da questo import il repo pubblico `Cleversoft-IT/cleverOps-public` è la **fonte canonica**:
  le modifiche successive si fanno qui.

## Versione

**v11.4.0** (26 settembre 2026), allineata a Drupal **11.4.x** (11.4.0 uscito il 1° luglio 2026).
Rispetto alla v11.3.0:

- baseline aggiornata a 11.4 e blocchi `[forward-looking 11.4+]` rivisti uno per uno sulle
  note di rilascio e sui change record ufficiali;
- nuova settima skill `drupal11-migrate` (Migrate API, sorgenti CSV/JSON, plugin con
  attributi, comandi Drush, percorso D7 → D11);
- nuova reference `drupal11-module-development/references/scaffolding-and-quality.md`
  (`drush generate` non interattivo, `drush field:create`, phpcs, principio "prima un modulo contrib");
- correzioni verificate sul codice di core (autowiring dei plugin, sequenza di `drush deploy`,
  Stable 9, SDC).

Il dettaglio è nel [CHANGELOG](CHANGELOG.md); la descrizione originale della suite, con tabella
delle skill, tag usati e installazione manuale, è in [SUITE.md](SUITE.md).

## Sostituzioni

Nell'installer le nuove skill prendono il posto delle vecchie (campo `replaces` in
`cleverops.json`):

| Vecchia skill | Sostituita da |
|---|---|
| `drupal-expert` | `drupal11-module-development` |
| `drupal-security` | `drupal11-devops-testing-security` |
| `drupal-migration` | `drupal11-migrate` |

## Licenza

La suite resta sotto licenza MIT del suo autore: il testo originale è in [LICENSE](LICENSE)
(Copyright (c) 2026 Stefano (cleversoft.it)) e va conservato in ogni copia. Il resto del repo è
MIT © Cleversoft IT (vedi il `LICENSE` alla radice).

Poiché l'installer copia solo la cartella di ciascuna skill (e `docs/` non è nel pacchetto npm),
ogni `skills/drupal11-*/` contiene la propria copia di `LICENSE`:

- `config-management`, `frontend-theming`, `performance-caching`, `views-and-queries`: la
  licenza della suite, identica all'originale;
- `module-development`, `devops-testing-security`, `migrate`: la stessa licenza MIT con in più la
  riga `Copyright (c) 2026 Cleversoft IT`, perché queste skill contengono anche materiale derivato
  dalle vecchie skill del repo (`drupal-expert`, `drupal-security`, `drupal-migration`, MIT ©
  Cleversoft IT). `drupal11-migrate` è nuova ma nasce da `drupal-migration` riscritta nel formato
  della suite, quindi porta entrambe le attribuzioni. Le due licenze sono MIT, quindi compatibili.
