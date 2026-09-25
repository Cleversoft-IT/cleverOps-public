import { CommandBlock } from "./CommandBlock";
import { HarnessBadge } from "./HarnessBadge";
import type { Skill } from "@/lib/skills";

export function SkillCard({ skill }: { skill: Skill }) {
  return (
    <article
      className={`flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-colors hover:bg-[color-mix(in_oklch,var(--card)_94%,var(--foreground))] ${
        skill.legacy ? "opacity-70 hover:opacity-100" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          <span className="h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden />
          {skill.category}
        </span>
        <span className="flex items-center gap-1.5">
          {skill.targets.map((t) => (
            <HarnessBadge key={t} target={t} />
          ))}
          {skill.legacy && (
            <span className="rounded-md border border-[var(--border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
              legacy
            </span>
          )}
        </span>
      </div>

      <h3 className="mt-4 font-mono text-lg font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
        {skill.name}
      </h3>
      <p className="mt-2.5 flex-1 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
        {skill.description}
      </p>

      {/* Comando: separato dal corpo, etichetta mono, comando completo che wrappa */}
      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          installa
        </span>
        <div className="mt-2">
          <CommandBlock command={skill.command} emphasize={skill.name} />
        </div>
      </div>
    </article>
  );
}
