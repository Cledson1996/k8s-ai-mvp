import clsx from "clsx";
import type { ResourceHealth } from "../../lib/explorer-types";

const healthMap: Record<ResourceHealth, string> = {
  healthy: "border-emerald-200 bg-emerald-100 text-emerald-700",
  warning: "border-amber-200 bg-amber-100 text-amber-700",
  critical: "border-rose-200 bg-rose-100 text-rose-700",
  unknown: "border-slate-200 bg-slate-100 text-slate-700"
};

const changeMap: Record<"added" | "removed" | "changed", string> = {
  added: "border-emerald-200 bg-emerald-100 text-emerald-700",
  removed: "border-rose-200 bg-rose-100 text-rose-700",
  changed: "border-sky-200 bg-sky-100 text-sky-700"
};

export function HealthPill({ health }: { health: ResourceHealth }) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em]",
        healthMap[health]
      )}
    >
      {health}
    </span>
  );
}

export function ChangePill({
  change
}: {
  change: "added" | "removed" | "changed";
}) {
  return (
    <span
      className={clsx(
        "inline-flex rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em]",
        changeMap[change]
      )}
    >
      {change}
    </span>
  );
}
