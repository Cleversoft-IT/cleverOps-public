import { ArrowUpRight } from "lucide-react";
import { CommandBlock } from "./CommandBlock";
import { Section } from "./Section";

// Dipendenze esterne opzionali: non sono skill del repo e non le cloniamo.
// L'installer le avvia solo se richieste con il flag corrispondente.
function ExtraCard({
  group,
  name,
  flag,
  command,
  docs,
  children,
}: {
  group: string;
  name: string;
  flag: string;
  command: string;
  docs: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          <span className="h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
          {group}
        </span>
        <span className="rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
          esterna
        </span>
      </div>

      <h3 className="mt-3 font-mono text-lg font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
        {name}
      </h3>
      {children}

      <div className="mt-4 border-t border-[var(--border)] pt-4">
        <CommandBlock command={command} />
        <p className="mt-2 font-mono text-[11px] text-[var(--muted-foreground)]">
          o con l&apos;installer: <span className="text-[var(--card-foreground)]">{flag}</span>
        </p>
        <a
          href={docs}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-[var(--muted-foreground)] transition-colors hover:text-brand-ink"
        >
          docs <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>
    </article>
  );
}

export function ExtraSection() {
  return (
    <Section
      id="extra"
      title="Extra"
      intro="Dipendenze esterne opzionali, non skill: hanno il loro comando e l'installer le avvia solo se lo chiedi."
    >
      <div className="grid gap-4">
        <ExtraCard
          group="Design"
          name="impeccable"
          flag="--impeccable"
          command="npx impeccable install"
          docs="https://impeccable.style"
        >
          <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
            Design system in-the-loop: PRODUCT.md + DESIGN.md e i comandi critique / polish / live.
          </p>
        </ExtraCard>

        <ExtraCard
          group="Statusline"
          name="ccstatusline"
          flag="--ccstatusline"
          command="npx ccstatusline-gradient@latest --onboard"
          docs="https://github.com/akkaz/ccstatusline-gradient"
        >
          <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
            Statusline per Claude Code: modello, contesto, versione, branch git e costi
            sempre sott&apos;occhio. Pacchetto npm a sé, con wizard di onboarding.
          </p>
          <div className="mt-4 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--zinc-950)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ccstatusline.png"
              alt="ccstatusline in azione: statusline con modello, contesto, versione e git"
              width={933}
              height={105}
              className="h-auto w-full"
            />
          </div>
        </ExtraCard>
      </div>
    </Section>
  );
}
