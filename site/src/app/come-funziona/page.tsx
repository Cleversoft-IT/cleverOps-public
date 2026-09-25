import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";

export const metadata: Metadata = {
  title: "Come funziona — cleverOps",
  description:
    "Skill, agent, flusso di attivazione e integrazione col design system Cleversoft via impeccable.",
};

const STEPS = [
  {
    n: "01",
    title: "Installi quello che ti serve",
    body: "Con npx cleverops scegli skill e agent e li copi (o symlink) in Claude Code, Codex o nel progetto. Niente account, niente lock-in.",
  },
  {
    n: "02",
    title: "Claude le carica da sole",
    body: "Ogni skill ha un SKILL.md con una description: il modello la attiva quando il contesto combacia (es. stai scrivendo una migration Drupal → si attiva drupal-migration).",
  },
  {
    n: "03",
    title: "Lavori con le best practice già dentro",
    body: "La skill porta convenzioni, comandi e guardrail verificati. Tu chiedi, l'agente esegue restando sui binari giusti.",
  },
];

export default function ComeFunziona() {
  return (
    <main className="px-6 pt-28 pb-20 sm:pt-32">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 font-mono text-xs text-[var(--muted-foreground)] transition-colors hover:text-brand"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          catalogo
        </Link>

        <h1 className="mt-8 font-mono text-2xl font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
          Come funziona
        </h1>
        <p className="mt-3 font-sans text-base leading-relaxed text-[var(--muted-foreground)]">
          cleverOps impacchetta il know-how DevOps/AI di Cleversoft in pezzi riusabili per
          gli assistenti di codice. I concetti in due minuti.
        </p>

        {/* Skill vs Agent */}
        <section className="mt-12">
          <h2 className="font-mono text-xl font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
            Skill e agent
          </h2>
          <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
            <div className="bg-[var(--card)] p-5">
              <h3 className="font-mono text-base font-semibold text-[var(--card-foreground)]">
                Skill
              </h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
                Una cartella con un{" "}
                <code className="font-mono text-[var(--card-foreground)]">SKILL.md</code> e risorse
                (script, reference, asset). Estende l&apos;assistente con conoscenza di dominio:
                Drupal, DevOps, AI, design.
              </p>
            </div>
            <div className="bg-[var(--card)] p-5">
              <h3 className="font-mono text-base font-semibold text-[var(--card-foreground)]">
                Agent
              </h3>
              <p className="mt-2 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
                Un subagent specializzato con prompt, strumenti e obiettivo propri. Lo lanci per
                un compito intero (es. generare un preventivo) e lavora in autonomia.
              </p>
            </div>
          </div>
        </section>

        {/* Flusso */}
        <section className="mt-12">
          <h2 className="font-mono text-xl font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
            Il flusso
          </h2>
          <div className="mt-5 border-t border-[var(--border)]">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-[var(--border)] py-5"
              >
                <span className="font-mono text-sm text-brand">{s.n}</span>
                <div>
                  <h3 className="font-mono text-base font-semibold text-[var(--card-foreground)]">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {s.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Design system + impeccable — stacco di capitolo zinc-950 */}
        <section className="mt-12 rounded-lg border border-[var(--border)] bg-[var(--zinc-950)] p-6 text-[var(--zinc-300)]">
          <h2 className="font-mono text-xl font-semibold tracking-[-0.01em] text-[var(--zinc-50)]">
            Il design system, dentro le skill
          </h2>
          <p className="mt-3 font-sans text-sm leading-relaxed text-[var(--zinc-400)]">
            Questo sito È la skill{" "}
            <code className="font-mono text-[var(--zinc-200)]">cleversoft-design-system</code> messa
            in pratica: stesso coral, stesso Geist Mono, stessi glifi. Il design system è scritto
            nel formato di{" "}
            <a
              href="https://impeccable.style"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              impeccable
            </a>{" "}
            — <code className="font-mono text-[var(--zinc-200)]">PRODUCT.md</code> (strategia) +{" "}
            <code className="font-mono text-[var(--zinc-200)]">DESIGN.md</code> (token e regole
            visive) — così gli assistenti restano on-brand da soli.
          </p>
          <p className="mt-4 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--zinc-500)]">
            comandi impeccable
          </p>
          <div className="mt-3 space-y-2">
            <CommandBlock command="npx impeccable install" prefix="$" tone="dark" />
            <CommandBlock command="/impeccable critique la home" prefix="›" tone="dark" />
            <CommandBlock command="/impeccable polish le card skill" prefix="›" tone="dark" />
          </div>
          <p className="mt-4 font-sans text-xs leading-relaxed text-[var(--zinc-500)]">
            <code className="font-mono">$</code> = terminale ·{" "}
            <code className="font-mono">›</code> = dentro Claude Code.
          </p>
        </section>

        <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--border)] pt-6 font-mono text-xs">
          <Link href="/#skill" className="text-[var(--muted-foreground)] transition-colors hover:text-brand">
            → Skill
          </Link>
          <Link href="/#toolbelt" className="text-[var(--muted-foreground)] transition-colors hover:text-brand">
            → Toolbelt
          </Link>
          <Link href="/#installa" className="text-[var(--muted-foreground)] transition-colors hover:text-brand">
            → Installer
          </Link>
        </div>
      </div>
    </main>
  );
}
