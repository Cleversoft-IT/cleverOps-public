"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

// Il tema vive nella classe .dark su <html> (applicata prima del paint dallo script in
// layout.tsx): il componente la legge come store esterno, senza duplicarla in uno stato.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const getSnapshot = () => document.documentElement.classList.contains("dark");
// In prerender non si conosce il tema: icona chiara, corretta subito dopo l'idratazione.
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Passa al tema chiaro" : "Passa al tema scuro"}
      className="grid h-8 w-8 place-items-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] transition-colors hover:text-brand-ink hover:border-brand/40"
    >
      {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
