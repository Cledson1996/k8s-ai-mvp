import clsx from "clsx";

export function SectionCard({
  title,
  eyebrow,
  description,
  children,
  className
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-[1.75rem] border border-black/5 bg-white/90 p-5 shadow-sm",
        className
      )}
    >
      <div className="mb-5">
        {eyebrow ? (
          <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.3em] text-tide">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm text-slate-500">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
