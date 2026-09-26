import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CommandBlock } from "@/components/CommandBlock";
import { Section } from "@/components/Section";
import { TableOfContents } from "@/components/TableOfContents";
import { SkillExplorer } from "@/components/SkillExplorer";
import { AgentCard } from "@/components/AgentCard";
import { InstallerSection } from "@/components/InstallerSection";
import { ExtraSection } from "@/components/ExtraSection";
import { catalog, hasAgents, offerLabelSentence } from "@/lib/skills";

const TOC = [
  { id: "skill", label: "Skill" },
  ...(hasAgents ? [{ id: "agent", label: "Agent" }] : []),
  { id: "installa", label: "Installer" },
  { id: "extra", label: "Extra" },
];

export default function Home() {
  return (
    <main>
      {/* Masthead — riferimento, non hero. Cosa c'è qui e come si prende. */}
      <header className="border-b border-[var(--border)] px-6 pt-28 pb-10 sm:pt-32">
        <div className="mx-auto max-w-5xl">
          <h1 className="font-mono text-2xl font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
            cleverOps<span className="text-brand">.</span>
          </h1>
          <p className="mt-3 max-w-2xl font-sans text-base leading-relaxed text-[var(--muted-foreground)]">
            {offerLabelSentence} che il team Cleversoft installa su Claude Code e Codex. Trova
            quello che ti serve, copia il comando, installa.
          </p>
          <div className="mt-5 max-w-xl">
            <CommandBlock command={`npx github:${catalog.repo}`} size="md" />
          </div>
          <p className="mt-2.5 font-sans text-sm text-[var(--muted-foreground)]">
            Installer interattivo. Per i dettagli e i flag vedi{" "}
            <a href="#installa" className="text-brand-ink hover:underline">
              Installer
            </a>
            ; per i concetti{" "}
            <Link href="/come-funziona/" className="text-brand-ink hover:underline">
              Come funziona
            </Link>
            .
          </p>
        </div>
      </header>

      {/* Corpo docs: contenuto + indice laterale sticky da xl: */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 xl:max-w-[80rem] xl:grid-cols-[1fr_13rem]">
        <div className="min-w-0">
          <Section
            id="skill"
            title="Skill"
            intro="Conoscenza di dominio impacchettata (SKILL.md + risorse). L'assistente le attiva da sé quando il contesto combacia. Elenco generato dal manifest del repository e dalle SKILL.md reali."
          >
            <SkillExplorer />
          </Section>

          {hasAgents && (
            <Section
              id="agent"
              title="Agent"
              intro="Subagent specializzati: prompt, strumenti e obiettivo propri. Li lanci per un compito intero."
            >
              <div className="grid gap-4 md:grid-cols-2">
                {catalog.agents.map((a) => (
                  <AgentCard key={a.name} agent={a} />
                ))}
              </div>
            </Section>
          )}

          <InstallerSection />

          <ExtraSection />
        </div>

        {/* Indice — rail strutturale, solo desktop largo */}
        <aside className="hidden border-l border-[var(--border)] px-6 py-12 xl:block">
          <TableOfContents items={TOC} />
          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <a
              href={`https://github.com/${catalog.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-[var(--muted-foreground)] transition-colors hover:text-brand-ink"
            >
              repository <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        </aside>
      </div>
    </main>
  );
}
