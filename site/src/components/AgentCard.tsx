import { Bot } from "lucide-react";
import { CommandBlock } from "./CommandBlock";
import type { Agent } from "@/lib/skills";

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <article className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm transition-colors hover:bg-[color-mix(in_oklch,var(--card)_94%,var(--foreground))]">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand text-white">
          <Bot className="h-5 w-5" />
        </span>
        <h3 className="font-mono text-lg font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
          {agent.name}
        </h3>
      </div>
      <p className="mt-4 flex-1 font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
        {agent.description}
      </p>

      <div className="mt-5 border-t border-[var(--border)] pt-4">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          installa
        </span>
        <div className="mt-2">
          <CommandBlock command={agent.command} emphasize={`${agent.name}.md`} />
        </div>
      </div>
    </article>
  );
}
