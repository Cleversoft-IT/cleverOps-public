import { CommandBlock } from "./CommandBlock";
import { Section } from "./Section";
import { catalog } from "@/lib/skills";

const TARGETS = [
  { key: "claude", label: "Claude Code", dir: "~/.claude/skills" },
  { key: "codex", label: "Codex CLI", dir: "~/.codex/skills" },
  { key: "project", label: "Progetto", dir: "<progetto>/.claude/skills" },
];

const FLAGS: { flag: string; what: string }[] = [
  { flag: "--target <t>", what: "dove installare: claude, codex o project (anche in lista, separati da virgola)" },
  { flag: "--skills <a,b>", what: "installa solo le skill elencate" },
  { flag: "--agents <f.md>", what: "installa solo gli agent elencati" },
  { flag: "--toolbelt", what: "installa i CLI del toolbelt (rg, fd, tree, ast-grep, gh)" },
  { flag: "--impeccable", what: "installa il design system impeccable" },
  { flag: "--all", what: "tutto il catalogo" },
];

export function InstallerSection() {
  const repo = catalog.repo;
  return (
    <Section
      id="installa"
      title="Installer"
      intro={
        <>
          <code className="font-mono text-[0.95em] text-[var(--card-foreground)]">cleverops</code>{" "}
          è una TUI: scegli dove installare, quali skill e se in copia o symlink. Oppure
          passa i flag e salti le domande.
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
              <code className="mt-2 block font-mono text-[11px] text-brand">--target {t.key}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Flag */}
      <div className="mt-8">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          flag
        </span>
        <dl className="mt-3 overflow-hidden rounded-lg border border-[var(--border)]">
          {FLAGS.map((f, i) => (
            <div
              key={f.flag}
              className={`grid grid-cols-1 gap-x-4 gap-y-1 bg-[var(--card)] px-4 py-3 sm:grid-cols-[12rem_1fr] ${
                i > 0 ? "border-t border-[var(--border)]" : ""
              }`}
            >
              <dt>
                <code className="font-mono text-xs text-brand">{f.flag}</code>
              </dt>
              <dd className="font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
                {f.what}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
