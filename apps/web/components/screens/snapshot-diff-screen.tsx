import Link from "next/link";
import { Breadcrumbs } from "../ui/breadcrumbs";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";
import { ChangePill } from "../ui/explorer-pill";
import { buildResourceHref } from "../../lib/routes";
import type { SnapshotDiff } from "../../lib/explorer-types";
import { formatRelativeTimestamp } from "../../lib/format";

export function SnapshotDiffScreen({
  diff,
  degradedSources
}: {
  diff: SnapshotDiff;
  degradedSources: string[];
}) {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "History", href: "/history" },
          { label: diff.currentSnapshotId },
          { label: "Compare" },
          { label: diff.previousSnapshotId }
        ]}
      />

      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Diff com fontes degradadas"
          body={`As fontes ${degradedSources.join(", ")} falharam em alguma etapa. O diff abaixo mostra somente o que foi persistido.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Snapshot diff"
        title={`${diff.currentSnapshotId} vs ${diff.previousSnapshotId}`}
        description={`Gerado em ${formatRelativeTimestamp(diff.generatedAt)}.`}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="Added" value={String(diff.summary.added)} />
          <Metric label="Removed" value={String(diff.summary.removed)} />
          <Metric label="Changed" value={String(diff.summary.changed)} />
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Change list"
        title="Mudancas observadas"
        description="Compare recurso por recurso sem perder o caminho de investigacao."
      >
        <div className="space-y-4">
          {diff.changes.map((change) => (
            <article
              key={`${change.changeType}-${change.resource.kind}-${change.resource.namespace}-${change.resource.name}`}
              className="rounded-[1.75rem] border border-black/5 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                    {change.resource.kind} / {change.resource.namespace}
                  </p>
                  <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
                    {change.resource.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">{change.detail}</p>
                </div>
                <ChangePill change={change.changeType} />
              </div>
              <Link
                href={buildResourceHref(
                  change.resource.kind,
                  change.resource.namespace,
                  change.resource.name
                )}
                className="mt-4 inline-flex text-sm font-medium text-tide transition hover:text-ember"
              >
                Abrir recurso
              </Link>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 px-4 py-3">
      <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
