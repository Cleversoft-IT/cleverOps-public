# Contratto del manifest `cleverops.json` (schemaVersion 1)

Ogni sorgente di skill (questo repo pubblico, il repo privato `cleverOps-internal`) ha alla
radice un `cleverops.json` (e, se serve, un `legacy-hashes.json` per riconoscere le installazioni
precedenti). È l'unica fonte dei metadati che non appartengono al frontmatter
standard delle skill: lo leggono l'installer, il generatore del sito e il generatore dei
cataloghi marketplace. Lo schema formale è in [`cleverops.schema.json`](../cleverops.schema.json).

```jsonc
{
  "$schema": "./cleverops.schema.json",
  "schemaVersion": 1,             // intero; un installer che non lo supporta salta la sorgente
  "id": "public",                 // identificativo stabile della sorgente: "public" | "internal"
  "visibility": "public",         // "public" | "private": il sito mostra solo le public
  "skills": {
    "plan-auditor": {             // chiave = nome cartella in skills/ = `name` nel frontmatter
      "category": "Workflow",     // etichetta libera per sito e TUI
      "targets": ["codex"],       // harness: "claude" | "codex"; default entrambi
      "legacy": false,            // opzionale: skill superata, mostrata come tale
      "replaces": [],             // opzionale: nomi storici che questa skill sostituisce (migrazioni)
      "requires": {               // opzionale: prerequisiti da verificare/segnalare
        "path": "~/.whisper-env"  //   percorso che deve esistere
      }
    }
  },
  "agents": {
    "nome-agent": {               // chiave = agents/<nome>.md
      "category": "Business",
      "targets": ["claude", "codex"]
    }
  }
}
```

## Regole

- L'installer considera **solo** gli elementi elencati nel manifest: una cartella non elencata
  viene ignorata. Nel repo pubblico ogni cartella in `skills/` deve avere una voce e viceversa
  (la CI lo verifica). Il repo privato, durante la transizione, può contenere ancora cartelle
  non elencate (le vecchie copie delle skill ormai pubbliche): restano solo per chi le usa via
  symlink e vengono rimosse dopo la migrazione.
- Il frontmatter delle `SKILL.md` contiene solo campi standard (`name`, `description`, ed
  eventualmente `license`, `allowed-tools`, `metadata`): niente `targets:` o altre chiavi
  proprietarie, che stanno qui.
- `replaces` alimenta la migrazione delle installazioni precedenti: una copia installata con un
  nome elencato in `replaces`, riconosciuta come nostra, viene sostituita da questa skill.
- Campi sconosciuti vanno ignorati con un avviso (compatibilità in avanti dentro la stessa
  `schemaVersion`); una `schemaVersion` più alta di quella supportata fa saltare la sorgente con
  l'invito ad aggiornare l'installer.
