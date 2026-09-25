import { ArrowUpRight } from "lucide-react";
import { CommandBlock } from "./CommandBlock";
import { Section } from "./Section";
import { tools } from "@/lib/tools";
import { catalog } from "@/lib/skills";

export function ToolbeltSection() {
  return (
    <Section
      id="toolbelt"
      title="Toolbelt"
      intro="Binari di sistema e dipendenze esterne, non skill: per usarli basta installarli. Il toolbelt CLI si prende tutto in una riga; impeccable e ccstatusline hanno il loro comando."
    >
      <div className="max-w-xl">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          tutto il toolbelt
        </span>
        <div className="mt-2.5">
          <CommandBlock
            command={`npx github:${catalog.repo} --toolbelt`}
            size="md"
            emphasize="--toolbelt"
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {tools.map((t) => (
          <article
            key={t.bin}
            className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-colors hover:bg-[color-mix(in_oklch,var(--card)_94%,var(--foreground))]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
                <span className="h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
                {t.group}
              </span>
              {t.external && (
                <span className="rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                  esterna
                </span>
              )}
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <h3 className="font-mono text-lg font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
                {t.bin}
              </h3>
              {t.replaces && (
                <span className="font-mono text-xs text-[var(--muted-foreground)]">
                  ↔ {t.replaces}
                </span>
              )}
            </div>
            <p className="mt-2 flex-1 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
              {t.what}
            </p>

            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <CommandBlock command={t.install} />
              {t.install2 && (
                <p className="mt-2 font-mono text-[11px] text-[var(--muted-foreground)]">
                  o <span className="text-[var(--card-foreground)]">{t.install2}</span>
                </p>
              )}
              <a
                href={t.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-[var(--muted-foreground)] transition-colors hover:text-brand"
              >
                docs <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          </article>
        ))}
      </div>

      {/* ccstatusline — dipendenza esterna con screenshot (statusline larga) */}
      <article className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
            <span className="h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
            Statusline
          </span>
          <span className="rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
            esterna
          </span>
        </div>

        <h3 className="mt-3 font-mono text-lg font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
          ccstatusline
        </h3>
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

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <CommandBlock command="npx ccstatusline-gradient@latest --onboard" />
          <a
            href="https://github.com/akkaz/ccstatusline-gradient"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-[var(--muted-foreground)] transition-colors hover:text-brand"
          >
            docs <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </article>
    </Section>
  );
}
