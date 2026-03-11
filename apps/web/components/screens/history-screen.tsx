import Link from "next/link";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";
import { buildSnapshotDiffHref } from "../../lib/routes";
import type { ClusterSnapshot } from "../../lib/explorer-types";
import { formatCount, formatRelativeTimestamp } from "../../lib/format";

export function HistoryScreen({
  snapshots,
  degradedSources
}: {
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}) {
  return (
    <div className="space-y-6">
      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Historico com coleta parcial"
          body={`As fontes ${degradedSources.join(", ")} nao responderam em algum ponto da serie. Os snapshots continuam disponiveis.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Snapshot archive"
        title="Historico local das coletas"
        description="Cada snapshot salva inventario, sinais e base para comparacoes futuras."
      >
        <div className="space-y-4">
          {snapshots.map((snapshot, index) => {
            const previous = snapshots[index + 1];

            return (
              <article
                key={snapshot.id}
                className="rounded-[1.75rem] border border-black/5 bg-white p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                      {snapshot.id}
                    </p>
                    <h2 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
                      {formatRelativeTimestamp(snapshot.collectedAt)}
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      {snapshot.clusterName} com {formatCount(snapshot.resourceCount, "recurso")} e{" "}
                      {formatCount(snapshot.issueCount, "issue")}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Metric label="Namespaces" value={String(snapshot.namespaceCount)} />
                    <Metric label="Recursos" value={String(snapshot.resourceCount)} />
                    <Metric label="Mudancas" value={String(snapshot.changeCount)} />
                  </div>
                </div>

                {previous ? (
                  <Link
                    href={buildSnapshotDiffHref(snapshot.id, previous.id)}
                    className="mt-5 inline-flex rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
                  >
                    Comparar com {previous.id}
                  </Link>
                ) : null}
              </article>
            );
          })}
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
