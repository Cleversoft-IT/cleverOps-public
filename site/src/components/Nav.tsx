"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { catalog } from "@/lib/skills";

export function Nav() {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <nav className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_80%,transparent)] px-3 py-2 shadow-[0_10px_24px_-6px_rgb(0_0_0/0.10)] backdrop-blur-xl sm:gap-4 sm:px-4">
        <Link href="/" className="flex items-center font-mono text-sm font-semibold tracking-tight">
          cleverOps<span className="text-brand">.</span>
        </Link>
        <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />
        <div className="hidden items-center gap-4 font-mono text-xs text-[var(--muted-foreground)] sm:flex">
          <Link href="/#skill" className="transition-colors hover:text-brand">skill</Link>
          <Link href="/#toolbelt" className="transition-colors hover:text-brand">toolbelt</Link>
          <Link href="/#agent" className="transition-colors hover:text-brand">agent</Link>
          <Link href="/#installa" className="transition-colors hover:text-brand">installa</Link>
          <Link href="/come-funziona" className="transition-colors hover:text-brand">come funziona</Link>
        </div>
        <span className="hidden h-4 w-px bg-[var(--border)] sm:block" />
        <div className="flex items-center gap-1.5">
          <a
            href={`https://github.com/${catalog.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Repository GitHub"
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted-foreground)] transition-colors hover:text-brand"
          >
            <Github className="h-4 w-4" />
          </a>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
