export function StatCard({
  label,
  value,
  detail,
  accent
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <article className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
      <div className="mb-5 h-2 w-20 rounded-full" style={{ background: accent }} />
      <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 font-[var(--font-heading)] text-3xl font-semibold text-ink">
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </article>
  );
}
