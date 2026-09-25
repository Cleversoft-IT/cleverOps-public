/**
 * Sezione di documentazione: heading plain ancorabile + slot opzionale a destra
 * (es. conteggio, link). Stesso ritmo per ogni sezione del sito.
 * La larghezza è gestita dal contenitore della pagina, non qui.
 */
export function Section({
  id,
  title,
  intro,
  aside,
  children,
  divider = true,
}: {
  id: string;
  title: string;
  /** una riga factory, niente claim */
  intro?: React.ReactNode;
  /** contenuto a destra dell'heading (conteggio, link…) */
  aside?: React.ReactNode;
  children: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 px-6 py-12 sm:py-14 ${
        divider ? "border-b border-[var(--border)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-mono text-xl font-semibold tracking-[-0.01em] text-[var(--card-foreground)]">
          {title}
        </h2>
        {aside}
      </div>
      {intro && (
        <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-[var(--muted-foreground)]">
          {intro}
        </p>
      )}
      <div className="mt-7">{children}</div>
    </section>
  );
}
