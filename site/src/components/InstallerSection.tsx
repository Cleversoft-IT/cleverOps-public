import { CommandBlock } from "./CommandBlock";
import { Section } from "./Section";
import { catalog, hasAgents } from "@/lib/skills";

// Allineato a docs/installer.md e a `cleverops --help`.
const TARGETS = [
  { key: "claude", label: "Claude Code", dir: "~/.claude/skills" },
  { key: "codex", label: "Codex CLI", dir: "~/.agents/skills" },
  { key: "project", label: "Progetto", dir: "<progetto>/.claude/skills" },
];

type Entry = { term: string; what: string };

const COMMANDS: Entry[] = [
  {
    term: "uninstall",
    what: "disinstalla offline leggendo solo il registro: rimuove ciò che cleverOps ha installato, salva in backup le copie modificate e non tocca le risorse di altri (es. uninstall --all --target codex)",
  },
  {
    term: "doctor",
    what: "diagnosi di registro, installazioni e migrazioni in sola lettura: niente scritture né download (--json per l'output da script)",
  },
  {
    term: "sync",
    what: "riconcilia: migra le installazioni delle versioni precedenti e, dove un plugin cleverOps è abilitato, rimuove le copie registrate per quell'harness; gira anche a ogni installazione",
  },
  {
    term: "restore <cartella-backup>",
    what: "ripristina offline file e link da una cartella di backup (quella che contiene manifest.json), senza sovrascrivere nulla",
  },
];

const FLAGS: Entry[] = [
  {
    term: "--target <t>",
    what: "dove installare: claude, codex o project, anche più d'uno separati da virgola; di default gli harness rilevati (se non ne trova, serve --target)",
  },
  {
    term: "--project <path>",
    what: "cartella del progetto per --target project, che usa .claude/{skills,agents} (default: la cartella corrente)",
  },
  { term: "--all", what: "tutte le risorse compatibili con i target scelti" },
  { term: "--skills <a,b>", what: "solo le skill elencate, con i nomi del catalogo" },
  ...(hasAgents ? [{ term: "--agents <a,b>", what: "solo gli agent elencati, con i nomi del catalogo" }] : []),
  { term: "--copy", what: "copia autonoma nella destinazione: è la modalità predefinita" },
  {
    term: "--from <path>",
    what: "usa come sorgente solo il manifest nella cartella indicata (un checkout locale); è l'unico caso in cui è ammesso --link",
  },
  { term: "--link", what: "symlink verso la sorgente invece della copia; richiede --from <path>" },
  {
    term: "--source <id>",
    what: "usa una sola sorgente (es. public); se non è raggiungibile l'installer esce con codice 3",
  },
  { term: "--no-private", what: "esclude le sorgenti private senza nemmeno provarne l'accesso (utile in CI)" },
  { term: "--list", what: "elenca il catalogo delle sorgenti accessibili ed esce (--list --json per l'output da script)" },
  { term: "--verbose", what: "mostra anche il motivo per cui una sorgente è stata saltata" },
  { term: "--toolbelt", what: "installa i CLI del toolbelt (rg, fd, tree, ast-grep, gh)" },
  { term: "--impeccable", what: "installa impeccable (design system, dipendenza esterna via npx)" },
  { term: "--ccstatusline", what: "installa ccstatusline-gradient, la statusline per Claude Code (esterna, via npx)" },
  { term: "--no-ccstatusline", what: "non avvia l'extra ccstatusline" },
  { term: "-y, --yes", what: "modalità non interattiva, senza domande" },
  { term: "-h, --help", what: "mostra l'aiuto con tutti i comandi e i flag" },
];

function EntryList({ label, entries }: { label: string; entries: Entry[] }) {
  return (
    <div className="mt-8">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        {label}
      </span>
      <dl className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
        {entries.map((e, i) => (
          <div
            key={e.term}
            className={`grid grid-cols-1 gap-x-4 gap-y-1 bg-[var(--card)] px-4 py-3 sm:grid-cols-[12rem_1fr] ${
              i > 0 ? "border-t border-[var(--border)]" : ""
            }`}
          >
            <dt>
              <code className="font-mono text-xs text-brand-ink">{e.term}</code>
            </dt>
            <dd className="font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">{e.what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function InstallerSection() {
  const repo = catalog.repo;
  return (
    <Section
      id="installa"
      title="Installer"
      intro={
        <>
          <code className="font-mono text-[0.95em] text-[var(--card-foreground)]">cleverops</code>{" "}
          è una TUI: scegli dove installare e cosa. Con un qualunque flag salta le domande e
          lavora in modo non interattivo, adatto anche agli script. Gli extra partono solo se
          li selezioni.
        </>
      }
      divider={false}
    >

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            interattivo
          </span>
          <p className="mt-2 flex-1 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
            La TUI guidata: ti chiede tutto.
          </p>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <CommandBlock command={`npx github:${repo}`} />
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            tutto il catalogo
          </span>
          <p className="mt-2 flex-1 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
            Tutte le skill su Claude Code e Codex.
          </p>
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <CommandBlock command={`npx github:${repo} --all --target claude,codex`} emphasize="--all" />
          </div>
        </div>
      </div>

      {/* Target */}
      <div className="mt-8">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          target
        </span>
        <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
          {TARGETS.map((t) => (
            <div key={t.key} className="bg-[var(--card)] p-4">
              <div className="font-mono text-sm font-medium text-[var(--card-foreground)]">
                {t.label}
              </div>
              <code className="mt-1 block font-mono text-xs text-[var(--muted-foreground)]">
                {t.dir}
              </code>
              <code className="mt-2 block font-mono text-[11px] text-brand-ink">--target {t.key}</code>
            </div>
          ))}
        </div>
      </div>

      <EntryList label="flag" entries={FLAGS} />
      <EntryList label="comandi" entries={COMMANDS} />
      <p className="mt-3 font-sans text-sm text-[var(--muted-foreground)]">
        Il comando va come primo argomento, per esempio:
      </p>
      <div className="mt-2 max-w-xl">
        <CommandBlock command={`npx github:${repo} doctor`} emphasize="doctor" />
      </div>
      <p className="mt-4 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
        Exit code: <code className="font-mono text-[var(--card-foreground)]">0</code> completato ·{" "}
        <code className="font-mono text-[var(--card-foreground)]">1</code> errore operativo ·{" "}
        <code className="font-mono text-[var(--card-foreground)]">2</code> argomenti o selezione non
        validi · <code className="font-mono text-[var(--card-foreground)]">3</code> sorgente
        richiesta con --source non disponibile.
      </p>
    </Section>
  );
}
