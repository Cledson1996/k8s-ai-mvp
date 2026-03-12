"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  HealthCenterAnalysisTarget,
  HealthCenterCard,
  HealthCenterResponse,
  HealthCenterSection,
  IssueCategory,
  ResourceKind,
  Severity,
} from "@k8s-ai-mvp/shared";
import { getHealthCenter, runHealthCenter } from "../../lib/health-center-api";
import { formatKindLabel, formatRelativeTimestamp } from "../../lib/format";
import { buildResourceHref } from "../../lib/routes";
import { DeploymentAnalysisDrawer } from "../ui/deployment-analysis-drawer";
import { NodeAnalysisDrawer } from "../ui/node-analysis-drawer";
import { ModalPortal } from "../ui/modal-portal";
import { SectionCard } from "../ui/section-card";
import { SeverityPill } from "../ui/status-pill";
import { StatCard } from "../ui/stat-card";
import { StateBanner } from "../ui/state-banner";

export function HealthCenterScreen({
  initialData,
}: {
  initialData: HealthCenterResponse;
}) {
  const [data, setData] = useState(initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<IssueCategory | "all">("all");
  const [namespaceQuery, setNamespaceQuery] = useState("");
  const [resourceKindFilter, setResourceKindFilter] = useState<ResourceKind | "all">("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyCleanup, setOnlyCleanup] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<"all" | "application" | "platform">("all");
  const [yamlTarget, setYamlTarget] = useState<{ title: string; yaml?: string } | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<HealthCenterAnalysisTarget | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void handleRefresh(false);
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  async function handleRefresh(force: boolean) {
    setRefreshing(true);
    try {
      const next = force ? await runHealthCenter() : await getHealthCenter();
      setData(next);
    } finally {
      setRefreshing(false);
    }
  }

  const sections = useMemo(
    () =>
      [
        data.criticalNow,
        data.emergingProblems,
        data.riskWatch,
        data.cleanupBacklog,
      ].map((section) => ({
        ...section,
        cards: section.cards.filter((card) => matchesFilters(card, {
          severityFilter,
          categoryFilter,
          namespaceQuery,
          resourceKindFilter,
          onlyNew,
          onlyCleanup,
          scopeFilter,
        })),
      })),
    [
      data,
      severityFilter,
      categoryFilter,
      namespaceQuery,
      resourceKindFilter,
      onlyNew,
      onlyCleanup,
      scopeFilter,
    ],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Criticos"
          value={String(data.summary.criticalCount)}
          detail="Problemas graves agora"
          accent="linear-gradient(90deg, #8f1d1d, #f26b6b)"
        />
        <StatCard
          label="Novos"
          value={String(data.summary.emergingCount)}
          detail="Mudancas recentes"
          accent="linear-gradient(90deg, #8d4b16, #f0bb67)"
        />
        <StatCard
          label="Cleanup"
          value={String(data.summary.cleanupCount)}
          detail="Lixos e inconsistencias"
          accent="linear-gradient(90deg, #3b4c5f, #9db6cb)"
        />
        <StatCard
          label="Nodes"
          value={String(data.summary.nodesUnderPressure)}
          detail="Sob pressao"
          accent="linear-gradient(90deg, #14385f, #49a4ff)"
        />
        <StatCard
          label="Deployments"
          value={String(data.summary.degradedDeployments)}
          detail="Rollout degradado"
          accent="linear-gradient(90deg, #0b5446, #41d0b2)"
        />
      </section>

      {data.degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Analise parcial"
          body={`As fontes ${data.degradedSources.join(", ")} nao responderam completamente. O Health Center segue usando o que conseguiu consolidar.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Health Center"
        title="Cockpit central do cluster"
        description={`Atualizado em ${formatRelativeTimestamp(data.generatedAt)}. Diff mais recente: ${data.diffSummary.changed} mudancas, ${data.diffSummary.added} adicoes, ${data.diffSummary.removed} remocoes.`}
      >
        <div className="grid gap-3 xl:grid-cols-4">
          <label className="space-y-2 text-sm text-slate-600">
            Severidade
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as Severity | "all")}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
            >
              <option value="all">Todas</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-600">
            Categoria
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as IssueCategory | "all")}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
            >
              <option value="all">Todas</option>
              <option value="availability">Availability</option>
              <option value="rollout">Rollout</option>
              <option value="autoscaling">Autoscaling</option>
              <option value="capacity">Capacity</option>
              <option value="networking">Networking</option>
              <option value="configuration">Configuration</option>
              <option value="cleanup">Cleanup</option>
              <option value="observability">Observability</option>
              <option value="reliability">Reliability</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-600">
            Recurso
            <select
              value={resourceKindFilter}
              onChange={(event) => setResourceKindFilter(event.target.value as ResourceKind | "all")}
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
            >
              <option value="all">Todos</option>
              <option value="Node">Node</option>
              <option value="Deployment">Deployment</option>
              <option value="Service">Service</option>
              <option value="Ingress">Ingress</option>
              <option value="Pod">Pod</option>
              <option value="ReplicaSet">ReplicaSet</option>
              <option value="Job">Job</option>
              <option value="ConfigMap">ConfigMap</option>
              <option value="PersistentVolumeClaim">PersistentVolumeClaim</option>
            </select>
          </label>
          <label className="space-y-2 text-sm text-slate-600">
            Namespace
            <input
              value={namespaceQuery}
              onChange={(event) => setNamespaceQuery(event.target.value)}
              placeholder="prod, monitoring, kube-system..."
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setOnlyNew((value) => !value)}
            className={toggleClass(onlyNew)}
          >
            Somente novos
          </button>
          <button
            type="button"
            onClick={() => setOnlyCleanup((value) => !value)}
            className={toggleClass(onlyCleanup)}
          >
            Somente cleanup
          </button>
          <button
            type="button"
            onClick={() =>
              setScopeFilter((value) =>
                value === "all" ? "platform" : value === "platform" ? "application" : "all",
              )
            }
            className={toggleClass(scopeFilter !== "all")}
          >
            {scopeFilter === "all"
              ? "Tudo"
              : scopeFilter === "platform"
                ? "Infraestrutura"
                : "Aplicacao"}
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh(true)}
            disabled={refreshing}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide disabled:cursor-wait disabled:opacity-70"
          >
            {refreshing ? "Atualizando..." : "Atualizar agora"}
          </button>
        </div>
      </SectionCard>

      <div className="space-y-6">
        {sections.map((section) => (
          <HealthSection
            key={section.id}
            section={section}
            onOpenYaml={(title, yaml) => setYamlTarget({ title, yaml })}
            onOpenAnalysis={(target) => setAnalysisTarget(target)}
          />
        ))}
      </div>

      <div className="rounded-3xl border border-black/5 bg-white px-5 py-4 text-sm text-slate-500">
        Gerado em {formatRelativeTimestamp(data.generatedAt)}. Snapshot atual {data.diffSummary.snapshotId}
        {data.diffSummary.previousSnapshotId
          ? ` comparado com ${data.diffSummary.previousSnapshotId}.`
          : "."}
      </div>

      {yamlTarget ? (
        <YamlModal
          title={yamlTarget.title}
          yaml={yamlTarget.yaml}
          onClose={() => setYamlTarget(null)}
        />
      ) : null}
      {analysisTarget?.type === "deployment" && analysisTarget.namespace ? (
        <DeploymentAnalysisDrawer
          namespace={analysisTarget.namespace}
          name={analysisTarget.name}
          onClose={() => setAnalysisTarget(null)}
        />
      ) : null}
      {analysisTarget?.type === "node" ? (
        <NodeAnalysisDrawer
          name={analysisTarget.name}
          onClose={() => setAnalysisTarget(null)}
        />
      ) : null}
    </div>
  );
}

function HealthSection({
  section,
  onOpenYaml,
  onOpenAnalysis,
}: {
  section: HealthCenterSection;
  onOpenYaml: (title: string, yaml?: string) => void;
  onOpenAnalysis: (target: HealthCenterAnalysisTarget) => void;
}) {
  return (
    <SectionCard
      eyebrow={section.title}
      title={section.title}
      description={section.description}
    >
      {section.cards.length > 0 ? (
        <div className="space-y-4">
          {section.cards.map((card) => (
            <HealthCard
              key={card.id}
              card={card}
              onOpenYaml={onOpenYaml}
              onOpenAnalysis={onOpenAnalysis}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-black/10 bg-slate-50 px-5 py-8 text-sm text-slate-500">
          Nenhum item neste bloco com os filtros atuais.
        </div>
      )}
    </SectionCard>
  );
}

function HealthCard({
  card,
  onOpenYaml,
  onOpenAnalysis,
}: {
  card: HealthCenterCard;
  onOpenYaml: (title: string, yaml?: string) => void;
  onOpenAnalysis: (target: HealthCenterAnalysisTarget) => void;
}) {
  const href = buildResourceHref(
    card.resource.kind,
    card.resource.namespace ?? "_cluster",
    card.resource.name,
  );

  return (
    <article className="rounded-[1.75rem] border border-black/5 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={card.severity} />
            <TrendPill trend={card.trend} />
            <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
              {card.category}
            </span>
            <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
              {card.scope === "platform" ? "infraestrutura" : "aplicacao"}
            </span>
          </div>
          <h3 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-ink">
            {card.title}
          </h3>
          <p className="mt-2 text-sm text-slate-600">{card.summary}</p>
          <p className="mt-3 text-sm text-slate-700">
            Por que agora: {card.whyNow}
          </p>
          <p className="mt-2 text-sm text-slate-700">
            Acao sugerida: {card.recommendedAction}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={href}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
          >
            Abrir recurso
          </Link>
          {card.manifestYaml ? (
            <button
              type="button"
              onClick={() =>
                onOpenYaml(`${card.resource.kind} ${card.resource.name}`, card.manifestYaml)
              }
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Ver YAML
            </button>
          ) : null}
          {card.analysisTarget ? (
            <button
              type="button"
              onClick={() => onOpenAnalysis(card.analysisTarget!)}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Ver analise
            </button>
          ) : null}
        </div>
      </div>

      {card.evidence.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {card.evidence.map((item) => (
            <span
              key={`${card.id}-${item.label}`}
              className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600"
            >
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      ) : null}

      {card.relatedResources.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {card.relatedResources.slice(0, 5).map((resource) => (
            <span
              key={`${card.id}-${resource.kind}-${resource.namespace ?? "_cluster"}-${resource.name}`}
              className="rounded-full border border-black/5 bg-white px-3 py-1 text-xs text-slate-600"
            >
              {formatKindLabel(resource.kind)}: {resource.name}
            </span>
          ))}
        </div>
      ) : null}

      {card.suggestedCommands.length > 0 ? (
        <div className="mt-4 space-y-2">
          {card.suggestedCommands.slice(0, 3).map((command) => (
            <code
              key={`${card.id}-${command}`}
              className="block overflow-x-auto rounded-2xl bg-[#04101d] px-4 py-3 font-[var(--font-mono)] text-xs text-[#dff7ff]"
            >
              {command}
            </code>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TrendPill({ trend }: { trend: HealthCenterCard["trend"] }) {
  const tone =
    trend === "new"
      ? "bg-sky-100 text-sky-800"
      : trend === "worsened"
        ? "bg-amber-100 text-amber-900"
        : trend === "improved"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] ${tone}`}>
      {trend}
    </span>
  );
}

function toggleClass(active: boolean) {
  return active
    ? "rounded-full border border-tide bg-tide px-4 py-2 text-sm font-medium text-white"
    : "rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700";
}

function matchesFilters(
  card: HealthCenterCard,
  filters: {
    severityFilter: Severity | "all";
    categoryFilter: IssueCategory | "all";
    namespaceQuery: string;
    resourceKindFilter: ResourceKind | "all";
    onlyNew: boolean;
    onlyCleanup: boolean;
    scopeFilter: "all" | "application" | "platform";
  },
) {
  const normalizedNamespace = filters.namespaceQuery.trim().toLowerCase();
  if (filters.severityFilter !== "all" && card.severity !== filters.severityFilter) {
    return false;
  }
  if (filters.categoryFilter !== "all" && card.category !== filters.categoryFilter) {
    return false;
  }
  if (filters.resourceKindFilter !== "all" && card.resource.kind !== filters.resourceKindFilter) {
    return false;
  }
  if (
    normalizedNamespace &&
    !(card.resource.namespace ?? "cluster").toLowerCase().includes(normalizedNamespace)
  ) {
    return false;
  }
  if (filters.onlyNew && !card.changedRecently) {
    return false;
  }
  if (filters.onlyCleanup && card.category !== "cleanup") {
    return false;
  }
  if (filters.scopeFilter !== "all" && card.scope !== filters.scopeFilter) {
    return false;
  }
  return true;
}

function YamlModal({
  title,
  yaml,
  onClose,
}: {
  title: string;
  yaml?: string;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
        <div className="flex h-[80vh] max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                Manifesto do recurso
              </p>
              <h4 className="mt-2 text-2xl font-semibold text-ink">{title}</h4>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#03111d] px-5 py-5">
            {yaml ? (
              <pre className="overflow-x-auto rounded-3xl bg-[#041a2b] p-4 font-[var(--font-mono)] text-xs leading-7 text-[#dff7ff]">
                <code>{yaml}</code>
              </pre>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-[#041a2b] px-4 py-5 text-sm text-white/75">
                O YAML bruto ainda nao esta disponivel para este recurso nesta coleta.
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
