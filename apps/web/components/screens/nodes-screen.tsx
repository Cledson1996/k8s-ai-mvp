import type { NodeHealth } from "@k8s-ai-mvp/shared";
import { formatCpu, formatMemory } from "../../lib/format";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";

export function NodesScreen({
  nodes,
  degradedSources
}: {
  nodes: NodeHealth[];
  degradedSources: string[];
}) {
  return (
    <div className="space-y-6">
      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Dados parciais"
          body={`As fontes ${degradedSources.join(", ")} nao responderam; os nodes abaixo podem estar sem metricas completas.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Node atlas"
        title="Capacidade, pressao e hotspots"
        description="Leitura operacional por node para identificar saturacao e distribuicao de workloads."
      >
        <div className="space-y-4">
          {nodes.map((node) => (
            <article
              key={node.name}
              className="rounded-[1.5rem] border border-black/5 bg-gradient-to-r from-white to-orange-50 p-5"
            >
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-[var(--font-heading)] text-2xl font-semibold text-ink">
                      {node.name}
                    </h3>
                    <span className="rounded-full bg-ink px-3 py-1 font-[var(--font-mono)] text-xs uppercase tracking-[0.26em] text-white">
                      {node.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Roles: {node.roles.join(", ") || "sem role"}
                  </p>
                  <p className="text-sm text-slate-500">
                    Taints: {node.taints.join(", ") || "sem taints"}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="CPU" value={formatCpu(node.usage.cpuCores)} />
                  <Metric label="Memoria" value={formatMemory(node.usage.memoryBytes)} />
                  <Metric label="Pods" value={String(node.podCount)} />
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-3xl bg-white px-4 py-4">
                  <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                    Pressao detectada
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {node.pressure.length > 0 ? (
                      node.pressure.map((pressure) => (
                        <span
                          key={pressure}
                          className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800"
                        >
                          {pressure}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">
                        sem pressao
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl bg-ink px-4 py-4 text-white">
                  <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                    Workloads mais pesados
                  </p>
                  <div className="mt-3 space-y-3">
                    {node.topWorkloads.map((workload) => (
                      <div
                        key={`${workload.namespace}/${workload.name}`}
                        className="flex items-center justify-between rounded-2xl border border-white/10 px-4 py-3"
                      >
                        <div>
                          <p className="font-semibold">{workload.name}</p>
                          <p className="text-sm text-white/70">
                            {workload.namespace} - {workload.kind}
                          </p>
                        </div>
                        <div className="text-right text-sm text-white/80">
                          <p>{formatCpu(workload.cpuCores)}</p>
                          <p>{formatMemory(workload.memoryBytes)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
      <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}
