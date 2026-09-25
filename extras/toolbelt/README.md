# Toolbelt CLI

**Dipendenze esterne**, non una skill: sono binari di sistema che rendono un coding
agent (Claude Code, Codex…) molto più efficace. Una volta installati, l'agente li usa
direttamente — non serve nessuna skill per `gh`, `rg` & co.

Stesso modello di `ccstatusline` e `impeccable`: l'installer `cleverops` li propone
come step opzionale, oppure li installi a mano con lo script qui sotto.

## I tool

| Tool | Sostituisce | A cosa serve | Docs |
|---|---|---|---|
| `rg` (ripgrep) | grep | Ricerca testo ricorsiva, velocissima, gitignore-aware | https://github.com/BurntSushi/ripgrep |
| `fd` | find | Trova file/cartelle con sintassi semplice | https://github.com/sharkdp/fd |
| `tree` | ls -R | Albero delle cartelle, per orientarsi nel repo | https://oldmanprogrammer.net/source.php?dir=projects/tree |
| `ast-grep` (`sg`) | sed/regex | Ricerca e refactor **strutturale** (AST), sicuro | https://ast-grep.github.io |
| `gh` | — | GitHub CLI: PR, issue, release, API | https://cli.github.com |

## Installazione

```bash
# via installer cleverops
npx github:Cleversoft-IT/cleverOps-public --toolbelt -y

# oppure direttamente lo script (rileva brew/apt/dnf/pacman/cargo/npm, installa i mancanti)
bash extras/toolbelt/install.sh
```

Note di piattaforma:
- **Debian/Ubuntu**: `fd` si installa come `fd-find` (binario `fdfind`) → lo script crea
  un alias `fd` in `~/.local/bin`.
- **`gh`** su apt usa il repo ufficiale GitHub (aggiunto dallo script se manca).
- **`ast-grep`**: senza brew, fallback su `npm i -g @ast-grep/cli` o `cargo install ast-grep`.

## Preferenze d'uso (per l'agente)

Quando questi tool sono presenti, conviene preferirli ai classici:
- cerca testo con **`rg`**, non `grep`; trova file con **`fd`**, non `find`;
- per refactor di codice usa **`ast-grep`** (struttura AST), non `sed`/regex;
- mappa un repo con **`tree -L 2 -I node_modules`**; operazioni GitHub via **`gh`**.
