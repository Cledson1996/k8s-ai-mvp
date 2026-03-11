"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";
import { HealthPill } from "../ui/explorer-pill";
import {
  buildResourceHref,
  buildNamespaceHref,
  buildSnapshotDiffHref
} from "../../lib/routes";
import type {
  ClusterSnapshot,
  NamespaceInventory
} from "../../lib/explorer-types";
import {
  formatCount,
  formatCpu,
  formatMemory,
  formatRelativeTimestamp
} from "../../lib/format";

export function ExplorerScreen({
  namespaces,
  snapshots,
  degradedSources
}: {
  namespaces: NamespaceInventory[];
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}) {
  const [query, setQuery] = useState("");

  const filteredNamespaces = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return namespaces;
    }

    return namespaces.filter((namespace) => {
      return (
        namespace.name.toLowerCase().includes(normalized) ||
        namespace.summary.toLowerCase().includes(normalized)
      );
    });
  }, [namespaces, query]);

  const totals = namespaces.reduce(
    (accumulator, namespace) => {
      accumulator.resources += namespace.resourceCount;
      accumulator.issues += namespace.issueCount;
      accumulator.unhealthy += namespace.unhealthyResourceCount;
      return accumulator;
    },
    { resources: 0, issues: 0, unhealthy: 0 }
  );
  const highlightedDeployments = namespaces
    .flatMap((namespace) =>
      namespace.resources
        .filter((resource) => resource.kind === "Deployment")
        .map((resource) => ({
          ...resource,
          namespace: namespace.name
        }))
    )
    .sort((left, right) => right.issueCount - left.issueCount || left.name.localeCompare(right.name))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Exploracao parcial"
          body={`As fontes ${degradedSources.join(", ")} nao responderam na ultima coleta. O inventario abaixo pode estar incompleto.`}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
        <SectionCard
          eyebrow="Cluster explorer"
          title="Namespaces como mapa vivo do cluster"
          description="Comece por namespace, filtre o ruido e entre no recurso que precisa de contexto."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <OverviewChip label="Namespaces" value={formatCount(namespaces.length, "namespace")} />
            <OverviewChip label="Recursos" value={formatCount(totals.resources, "recurso")} />
            <OverviewChip label="Sinais ativos" value={formatCount(totals.issues, "issue")} />
          </div>
          <label className="mt-5 block space-y-2 text-sm text-slate-600">
            Buscar namespace
            <input
              aria-label="Buscar namespace"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              placeholder="payments, observability, core-api..."
            />
          </label>
        </SectionCard>

        <SectionCard
          eyebrow="Snapshot pulse"
          title="Historico recente"
          description="Cada coleta salva um ponto de comparacao para entender o que mudou."
        >
          <div className="space-y-3">
            {snapshots.slice(0, 3).map((snapshot, index) => {
              const previous = snapshots[index + 1];

              return (
                <div key={snapshot.id} className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                  <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                    {snapshot.id}
                  </p>
                  <p className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-ink">
                    {formatRelativeTimestamp(snapshot.collectedAt)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatCount(snapshot.changeCount, "mudanca")}
                  </p>
                  {previous ? (
                    <Link
                      href={buildSnapshotDiffHref(snapshot.id, previous.id)}
                      className="mt-3 inline-flex text-sm font-medium text-tide transition hover:text-ember"
                    >
                      Comparar com a coleta anterior
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        eyebrow="Namespace atlas"
        title="Inventario por namespace"
        description="Todos os namespaces por padrao, com foco em saude, densidade e proximos passos."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredNamespaces.map((namespace) => (
            <article
              key={namespace.name}
              className="rounded-[1.75rem] border border-black/5 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-[var(--font-heading)] text-2xl font-semibold text-ink">
                    {namespace.name}
                  </h3>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">{namespace.summary}</p>
                </div>
                <HealthPill health={namespace.status} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Pods" value={formatCount(namespace.podCount, "pod")} />
                <MiniMetric label="Recursos" value={formatCount(namespace.resourceCount, "recurso")} />
                <MiniMetric label="Risco" value={formatCount(namespace.unhealthyResourceCount, "item")} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {namespace.kinds.map((entry) => (
                  <span
                    key={`${namespace.name}-${entry.kind}`}
                    className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                  >
                    {entry.kind}: {entry.count}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-slate-500">
                  <span>{formatCpu(namespace.cpuCores)}</span>
                  <span className="mx-2 text-slate-300">/</span>
                  <span>{formatMemory(namespace.memoryBytes)}</span>
                </div>
                <Link
                  href={buildNamespaceHref(namespace.name)}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
                >
                  Abrir namespace
                </Link>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Deployment radar"
        title="Deployments criticos em destaque"
        description="Atalho rapido para abrir os deployments com mais sinais ativos antes de navegar pelo namespace."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {highlightedDeployments.map((deployment) => (
            <article
              key={`${deployment.namespace}/${deployment.name}`}
              className="rounded-[1.5rem] border border-black/5 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                    {deployment.namespace}
                  </p>
                  <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-ink">
                    {deployment.name}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">{deployment.summary}</p>
                </div>
                <HealthPill health={deployment.health} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  issues: {deployment.issueCount}
                </span>
                <Link
                  href={buildResourceHref("Deployment", deployment.namespace, deployment.name)}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
                >
                  Abrir deployment
                </Link>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function OverviewChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-ink">
        {value}
      </p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/5 bg-slate-50 px-4 py-3">
      <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
