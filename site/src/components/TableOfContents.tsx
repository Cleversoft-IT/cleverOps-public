"use client";

import { useEffect, useState } from "react";

export type TocItem = { id: string; label: string };

/**
 * Indice laterale stile docs: link agli anchor di sezione, evidenzia la sezione
 * attiva durante lo scroll. Visibile solo da xl: (rail strutturale).
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="Indice della pagina" className="sticky top-24">
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
        In questa pagina
      </p>
      <ul className="mt-3 space-y-0.5 border-l border-[var(--border)]">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`-ml-px block border-l py-1 pl-3 font-mono text-xs transition-colors ${
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--card-foreground)]"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
