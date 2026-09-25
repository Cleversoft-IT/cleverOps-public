import { catalog } from "@/lib/skills";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--zinc-950)] text-[var(--zinc-400)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-mono text-lg font-semibold tracking-tight text-[var(--zinc-50)]">
            cleverOps<span className="text-brand">.</span>
          </div>
          <p className="mt-1 max-w-sm font-sans text-sm text-[var(--zinc-400)]">
            Skill e agent DevOps/AI di Cleversoft IT per Claude Code e Codex.
          </p>
        </div>
        <div className="flex flex-col gap-2 font-mono text-xs text-[var(--zinc-500)] sm:items-end">
          <a href={`https://github.com/${catalog.repo}`} className="transition-colors hover:text-brand" target="_blank" rel="noopener noreferrer">
            github.com/{catalog.repo}
          </a>
          <span className="text-[var(--zinc-600)]">
            © 2026 · CLEVERSOFT IT · MADE IN VALLE CAMONICA<span className="cursor-blink">_</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
