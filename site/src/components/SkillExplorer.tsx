"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { SkillCard } from "./SkillCard";
import { catalog } from "@/lib/skills";

const ALL = "tutte";

export function SkillExplorer() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>(ALL);

  const filters = [ALL, ...catalog.categories];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.skills.filter((s) => {
      const matchesCat = cat === ALL || s.category === cat;
      const matchesQ =
        !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [query, cat]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* ricerca */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca una skill…"
            aria-label="Cerca tra le skill"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--card)] py-2 pl-9 pr-9 font-sans text-sm text-[var(--card-foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--ring)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Cancella ricerca"
              className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[var(--muted-foreground)] hover:text-brand"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* filtri categoria */}
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const active = f === cat;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setCat(f)}
                aria-pressed={active}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs lowercase transition-colors ${
                  active
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-brand hover:border-brand/30"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {/* conteggio risultati — feedback del filtro, non vanity */}
      <p className="mt-4 font-mono text-xs text-[var(--muted-foreground)]">
        {filtered.length} di {catalog.skills.length}
      </p>

      {/* griglia */}
      {filtered.length > 0 ? (
        <div className="mt-3 grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {filtered.map((s) => (
            <SkillCard key={s.name} skill={s} />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-mono text-sm text-[var(--muted-foreground)]">
            Nessuna skill per “{query}”
          </p>
        </div>
      )}
    </div>
  );
}
