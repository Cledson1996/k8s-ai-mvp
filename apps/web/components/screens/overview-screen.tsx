import type { ClusterOverview } from "@k8s-ai-mvp/shared";
import { formatCpu, formatMemory, formatRelativeTimestamp } from "../../lib/format";
import { SectionCard } from "../ui/section-card";
import { SeverityPill, SourcePill } from "../ui/status-pill";
import { StatCard } from "../ui/stat-card";
import { StateBanner } from "../ui/state-banner";

export function OverviewScreen({
  overview,
  degradedSources
}: {
  overview: ClusterOverview;
  degradedSources: string[];
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Nodes"
          value={String(overview.nodeCount)}
          detail={`${overview.namespaceCount} namespaces observados`}
          accent="linear-gradient(90deg, #0d4f52, #48d4b5)"
        />
        <StatCard
          label="Pods"
          value={String(overview.podCount)}
          detail={`${overview.unhealthyPodCount} com saude degradada`}
          accent="linear-gradient(90deg, #ef6f45, #f8c07d)"
        />
        <StatCard
          label="CPU"
          value={formatCpu(overview.usage.cpuCores)}
          detail={`${overview.usage.cpuPercent?.toFixed(0) ?? "--"}% do total observado`}
          accent="linear-gradient(90deg, #2048ba, #5ac8fa)"
        />
        <StatCard
          label="Memoria"
          value={formatMemory(overview.usage.memoryBytes)}
          detail={`${overview.totalRestarts} restarts acumulados`}
          accent="linear-gradient(90deg, #6d31d8, #b874ff)"
        />
      </section>

      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Algumas fontes estao degradadas"
          body={`A tela segue funcional, mas as fontes ${degradedSources.join(", ")} nao responderam na ultima coleta.`}
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <SectionCard
          eyebrow="Cluster pulse"
          title={overview.clusterName}
          description={`Snapshot coletado ${formatRelativeTimestamp(overview.collectedAt)}.`}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-ink p-5 text-white">
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Namespaces com maior consumo
              </p>
              <div className="mt-4 space-y-3">
                {overview.topNamespaces.map((namespace) => (
                  <div
                    key={namespace.name}
                    className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold">{namespace.name}</p>
                      <p className="text-sm text-white/70">
                        {namespace.podCount} pods - {namespace.unhealthyPodCount} com problema
                      </p>
                    </div>
                    <div className="text-right text-sm text-white/80">
                      <p>{formatCpu(namespace.cpuCores)}</p>
                      <p>{formatMemory(namespace.memoryBytes)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-black/5 bg-orange-50 p-5">
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                Pods com mais reinicios
              </p>
              <div className="mt-4 space-y-3">
                {overview.topRestarts.map((pod) => (
                  <div
                    key={`${pod.namespace}/${pod.name}`}
                    className="rounded-2xl bg-white px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{pod.name}</p>
                        <p className="text-sm text-slate-500">{pod.namespace}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-[var(--font-heading)] text-2xl font-semibold text-ember">
                          {pod.restarts}
                        </p>
                        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                          restarts
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Priority queue"
          title="Achados em destaque"
          description="Uma visao rapida das recomendacoes que merecem atencao primeiro."
        >
          <div className="space-y-4">
            {overview.highlightedIssues.map((issue) => (
              <article
                key={issue.id}
                className="rounded-3xl border border-black/5 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityPill severity={issue.severity} />
                  <SourcePill source={issue.source} />
                </div>
                <h3 className="mt-3 font-[var(--font-heading)] text-xl font-semibold text-ink">
                  {issue.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600">{issue.summary}</p>
                <p className="mt-3 text-sm font-medium text-ink">
                  Proximo passo:{" "}
                  <span className="font-normal text-slate-600">
                    {issue.recommendation}
                  </span>
                </p>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
