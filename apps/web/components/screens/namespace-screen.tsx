"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Breadcrumbs } from "../ui/breadcrumbs";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";
import { SeverityPill, SourcePill } from "../ui/status-pill";
import { HealthPill } from "../ui/explorer-pill";
import {
  buildResourceHref,
  buildSnapshotDiffHref
} from "../../lib/routes";
import type {
  ClusterSnapshot,
  NamespaceInventory,
  ResourceKind
} from "../../lib/explorer-types";
import {
  formatCpu,
  formatMemory,
  formatRelativeTimestamp
} from "../../lib/format";

export function NamespaceScreen({
  namespace,
  snapshots,
  degradedSources
}: {
  namespace: NamespaceInventory;
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}) {
  const [kindFilter, setKindFilter] = useState<ResourceKind | "all">("all");

  const filteredResources = useMemo(() => {
    if (kindFilter === "all") {
      return namespace.resources;
    }

    return namespace.resources.filter((resource) => resource.kind === kindFilter);
  }, [kindFilter, namespace.resources]);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Explorer", href: "/explorer" },
          { label: namespace.name }
        ]}
      />

      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Namespace com coleta parcial"
          body={`As fontes ${degradedSources.join(", ")} nao responderam em pelo menos uma parte da coleta desta visao.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Namespace detail"
        title={namespace.name}
        description={namespace.summary}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Pods" value={String(namespace.podCount)} />
            <Metric label="Recursos" value={String(namespace.resourceCount)} />
            <Metric label="Issues" value={String(namespace.issueCount)} />
            <Metric
              label="Uso"
              value={`${formatCpu(namespace.cpuCores)} / ${formatMemory(namespace.memoryBytes)}`}
            />
          </div>
          <HealthPill health={namespace.status} />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <SectionCard
          eyebrow="Resource drill-down"
          title="Recursos do namespace"
          description="Filtre por kind e entre no detalhe de cada recurso com relacoes e historico."
        >
          <label className="mb-5 block space-y-2 text-sm text-slate-600">
            Filtrar por kind
            <select
              aria-label="Filtrar recursos por kind"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={kindFilter}
              onChange={(event) =>
                setKindFilter(event.target.value as ResourceKind | "all")
              }
            >
              <option value="all">Todos</option>
              {namespace.kinds.map((entry) => (
                <option key={entry.kind} value={entry.kind}>
                  {entry.kind}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-4">
            {filteredResources.map((resource) => (
              <article
                key={`${resource.kind}-${resource.name}`}
                className="rounded-[1.75rem] border border-black/5 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
                      {resource.kind}
                    </p>
                    <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
                      {resource.name}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">{resource.summary}</p>
                  </div>
                  <HealthPill health={resource.health} />
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Metric label="Status" value={resource.status} />
                  <Metric
                    label="Ready"
                    value={
                      resource.ready !== undefined && resource.desired !== undefined
                        ? `${resource.ready}/${resource.desired}`
                        : "--"
                    }
                  />
                  <Metric label="CPU" value={formatCpu(resource.cpuCores)} />
                  <Metric label="Memoria" value={formatMemory(resource.memoryBytes)} />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {resource.labels?.map((label) => (
                      <span
                        key={`${resource.name}-${label}`}
                        className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={buildResourceHref(
                      resource.kind,
                      resource.namespace,
                      resource.name
                    )}
                    className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
                  >
                    Ver recurso
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Issue context"
            title="Achados do namespace"
            description="Problemas agrupados no namespace para reduzir ruido e manter contexto."
          >
            <div className="space-y-3">
              {namespace.issues.map((issue) => (
                <div
                  key={issue.id}
                  className="rounded-3xl border border-black/5 bg-slate-50 p-4"
                >
                  <div className="flex flex-wrap gap-2">
                    <SeverityPill severity={issue.severity} />
                    <SourcePill source={issue.source} />
                  </div>
                  <p className="mt-3 font-medium text-ink">{issue.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{issue.summary}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="History bridge"
            title="Comparacao recente"
            description="Acesse o diff mais proximo sem sair do contexto do namespace."
          >
            <div className="space-y-3">
              {snapshots.slice(0, 2).map((snapshot, index) => {
                const previous = snapshots[index + 1];

                return (
                  <div key={snapshot.id} className="rounded-3xl bg-slate-50 p-4">
                    <p className="font-medium text-ink">
                      {formatRelativeTimestamp(snapshot.collectedAt)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {snapshot.id}
                    </p>
                    {previous ? (
                      <Link
                        href={buildSnapshotDiffHref(snapshot.id, previous.id)}
                        className="mt-3 inline-flex text-sm font-medium text-tide transition hover:text-ember"
                      >
                        Abrir diff desta coleta
                      </Link>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>
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
