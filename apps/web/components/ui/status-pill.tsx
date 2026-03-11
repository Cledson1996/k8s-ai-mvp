import clsx from "clsx";
import type { AnalysisSource, Severity } from "@k8s-ai-mvp/shared";

const severityMap: Record<Severity, string> = {
  critical: "border-rose-200 bg-rose-100 text-rose-700",
  high: "border-orange-200 bg-orange-100 text-orange-700",
  medium: "border-amber-200 bg-amber-100 text-amber-700",
  low: "border-emerald-200 bg-emerald-100 text-emerald-700",
  info: "border-sky-200 bg-sky-100 text-sky-700"
};

const sourceMap: Record<AnalysisSource, string> = {
  rule: "border-slate-200 bg-slate-100 text-slate-700",
  prometheus: "border-cyan-200 bg-cyan-100 text-cyan-700",
  k8sgpt: "border-violet-200 bg-violet-100 text-violet-700"
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em]",
        severityMap[severity]
      )}
    >
      {severity}
    </span>
  );
}

export function SourcePill({ source }: { source: AnalysisSource }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em]",
        sourceMap[source]
      )}
    >
      {source}
    </span>
  );
}
