export function StateBanner({
  title,
  body,
  tone = "neutral"
}: {
  title: string;
  body: string;
  tone?: "neutral" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-3xl border px-4 py-4 ${toneClass}`}>
      <p className="font-[var(--font-heading)] text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm">{body}</p>
    </div>
  );
}
