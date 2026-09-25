// Toolbelt CLI consigliato per coding agent + dipendenze esterne (es. impeccable).
// Curato a mano: sono binari, non skill del repo. La skill `ai-dev-toolbelt`
// documenta gli stessi tool e include lo script d'installazione cross-OS.

export type Tool = {
  bin: string;
  replaces?: string;
  what: string;
  install: string;
  install2?: string;
  docs: string;
  group: string;
  external?: boolean;
};

export const tools: Tool[] = [
  {
    bin: "rg",
    replaces: "grep",
    what: "Ricerca testo ricorsiva, velocissima, gitignore-aware. Il pane quotidiano dell'agente.",
    install: "brew install ripgrep",
    install2: "sudo apt install ripgrep",
    docs: "https://github.com/BurntSushi/ripgrep",
    group: "Ricerca",
  },
  {
    bin: "fd",
    replaces: "find",
    what: "Trova file e cartelle con sintassi umana, rispettando .gitignore.",
    install: "brew install fd",
    install2: "sudo apt install fd-find",
    docs: "https://github.com/sharkdp/fd",
    group: "Ricerca",
  },
  {
    bin: "tree",
    replaces: "ls -R",
    what: "Albero delle cartelle: mappa un repo sconosciuto in un colpo.",
    install: "brew install tree",
    install2: "sudo apt install tree",
    docs: "https://oldmanprogrammer.net/source.php?dir=projects/tree",
    group: "Ricerca",
  },
  {
    bin: "ast-grep",
    replaces: "sed / regex",
    what: "Ricerca e refactor strutturale su AST: cambia codice per sintassi, non per testo. Refactor sicuri.",
    install: "brew install ast-grep",
    install2: "npm i -g @ast-grep/cli",
    docs: "https://ast-grep.github.io",
    group: "Refactor",
  },
  {
    bin: "gh",
    what: "GitHub CLI: PR, issue, release, API. Indispensabile coi coding agent.",
    install: "brew install gh",
    install2: "sudo apt install gh",
    docs: "https://cli.github.com",
    group: "GitHub",
  },
  {
    bin: "impeccable",
    what: "Design system in-the-loop: PRODUCT.md + DESIGN.md e i comandi critique / polish / live. Dipendenza esterna, non la cloniamo.",
    install: "npx impeccable install",
    docs: "https://impeccable.style",
    group: "Design",
    external: true,
  },
];
