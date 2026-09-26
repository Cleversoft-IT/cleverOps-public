"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Tone = "default" | "dark";
type Size = "sm" | "md";

export function CommandBlock({
  command,
  prefix = "$",
  tone = "default",
  size = "sm",
  emphasize,
  className = "",
}: {
  command: string;
  prefix?: string;
  tone?: Tone;
  size?: Size;
  /** sottostringa da evidenziare (es. il nome skill); il resto del comando va in muted */
  emphasize?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  // accent: coral per testo e icone. Su fondo chiaro la variante scura (brand-ink, ≥4.5:1),
  // sul blocco scuro il coral pieno, che lì supera già 5:1.
  const tones: Record<Tone, { box: string; code: string; muted: string; accent: string; hover: string }> = {
    default: {
      box: "border-[var(--border)] bg-[var(--background)]",
      code: "text-[var(--card-foreground)]",
      muted: "text-[var(--muted-foreground)]",
      accent: "text-brand-ink",
      hover: "hover:text-brand-ink",
    },
    dark: {
      box: "border-[var(--zinc-800)] bg-[var(--zinc-900)]",
      code: "text-[var(--zinc-200)]",
      muted: "text-[var(--zinc-500)]",
      accent: "text-brand",
      hover: "hover:text-brand",
    },
  };
  const t = tones[tone];

  const sizes: Record<Size, { code: string; pad: string }> = {
    sm: { code: "text-[13px] leading-[1.5]", pad: "px-3 py-2.5" },
    md: { code: "text-[15px] leading-[1.55]", pad: "px-4 py-3.5" },
  };
  const s = sizes[size];

  // Con `emphasize`: boilerplate in muted, token evidenziato in colore pieno + semibold.
  // lastIndexOf: il token evidenziato (nome skill/agent, flag) sta in fondo al comando.
  const idx = emphasize ? command.lastIndexOf(emphasize) : -1;
  const codeContent =
    idx >= 0 && emphasize ? (
      <>
        <span className={t.muted}>{command.slice(0, idx)}</span>
        <span className={`${t.code} font-semibold`}>{emphasize}</span>
        <span className={t.muted}>{command.slice(idx + emphasize.length)}</span>
      </>
    ) : (
      command
    );

  return (
    <div className={`flex items-start gap-2.5 rounded-md border ${s.pad} ${t.box} ${className}`}>
      <span className={`select-none pt-px font-mono font-medium ${t.accent} ${s.code}`} aria-hidden>
        {prefix}
      </span>
      {/* Comando completo: wrappa su più righe, niente scroll orizzontale */}
      <code className={`min-w-0 flex-1 whitespace-pre-wrap break-all font-mono ${s.code} ${emphasize ? t.muted : t.code}`}>
        {codeContent}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Comando copiato" : "Copia comando"}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${t.muted} transition-colors ${t.hover}`}
      >
        {copied ? <Check className={`h-4 w-4 ${t.accent}`} /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}
