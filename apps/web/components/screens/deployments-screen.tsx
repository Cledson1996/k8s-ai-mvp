"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DeploymentInventory } from "../../lib/explorer-types";
import {
  formatCpuCompact,
  formatMemoryCompact,
} from "../../lib/format";
import { buildResourceHref } from "../../lib/routes";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";
import { HealthPill } from "../ui/explorer-pill";
import { DeploymentHistoryModal } from "../ui/history-metrics-modal";
import { SeverityPill } from "../ui/status-pill";

export function DeploymentsScreen({
  deployments,
  degradedSources
}: {
  deployments: DeploymentInventory[];
  degradedSources: string[];
}) {
  const [namespaceQuery, setNamespaceQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "healthy" | "degraded">("all");
  const [hpaFilter, setHpaFilter] = useState<"all" | "with-hpa" | "without-hpa">("all");
  const [networkFilter, setNetworkFilter] = useState<"all" | "network-risk" | "cleanup">("all");

  const filteredDeployments = useMemo(() => {
    const normalizedNamespace = namespaceQuery.trim().toLowerCase();

    return deployments.filter((deployment) => {
      const namespaceMatches =
        !normalizedNamespace || deployment.namespace.toLowerCase().includes(normalizedNamespace);
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "healthy" ? !deployment.rolloutDegraded : deployment.rolloutDegraded);
      const hpaMatches =
        hpaFilter === "all" ||
        (hpaFilter === "with-hpa" ? deployment.autoscaling?.enabled : !deployment.autoscaling?.enabled);
      const hasNetworkRisk = deployment.topIssues.some(
        (issue) => issue.category === "networking" || issue.category === "availability"
      );
      const hasCleanup = deployment.cleanupSignals.length > 0 || deployment.topIssues.some((issue) => issue.category === "cleanup");
      const networkMatches =
        networkFilter === "all" ||
        (networkFilter === "network-risk" ? hasNetworkRisk : hasCleanup);

      return namespaceMatches && statusMatches && hpaMatches && networkMatches;
    });
  }, [deployments, namespaceQuery, statusFilter, hpaFilter, networkFilter]);

  return (
    <div className="space-y-6">
      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Catalogo parcial"
          body={`As fontes ${degradedSources.join(", ")} nao responderam completamente; alguns deployments podem estar com rede ou metricas incompletas.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Deployment catalog"
        title="Todos os deployments com cadeia de rede e dependencias"
        description="Use esta visao como cockpit de aplicacao: rollout, HPA, services, ingresses, endpoints e config conectados no mesmo lugar."
      >
        <div className="mb-5 grid gap-3 xl:grid-cols-4">
          <label className="space-y-2 text-sm text-slate-600">
            Namespace
            <input
              aria-label="Filtrar deployments por namespace"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={namespaceQuery}
              onChange={(event) => setNamespaceQuery(event.target.value)}
              placeholder="payments, core-api, monitoring..."
            />
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            Status
            <select
              aria-label="Filtrar deployments por status"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            >
              <option value="all">Todos</option>
              <option value="healthy">Rollout saudavel</option>
              <option value="degraded">Rollout degradado</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            HPA
            <select
              aria-label="Filtrar deployments por hpa"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={hpaFilter}
              onChange={(event) => setHpaFilter(event.target.value as typeof hpaFilter)}
            >
              <option value="all">Todos</option>
              <option value="with-hpa">Com HPA</option>
              <option value="without-hpa">Sem HPA</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            Foco
            <select
              aria-label="Filtrar deployments por foco"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={networkFilter}
              onChange={(event) => setNetworkFilter(event.target.value as typeof networkFilter)}
            >
              <option value="all">Tudo</option>
              <option value="network-risk">Problemas de rede</option>
              <option value="cleanup">Limpeza e inconsistencia</option>
            </select>
          </label>
        </div>

        {filteredDeployments.length > 0 ? (
          <div className="space-y-4">
            {filteredDeployments.map((deployment) => (
              <DeploymentCard key={deployment.key} deployment={deployment} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-black/10 bg-slate-50 px-5 py-8 text-sm text-slate-500">
            Nenhum deployment foi carregado nesta coleta. Se a API acabou de reiniciar ou esta atualizando o snapshot, aguarde alguns segundos e atualize a pagina.
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function DeploymentCard({ deployment }: { deployment: DeploymentInventory }) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const services = deployment.exposure?.services ?? [];
  const ingresses = deployment.exposure?.ingresses ?? [];

  return (
    <article className="rounded-[1.75rem] border border-black/5 bg-white p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-[var(--font-heading)] text-2xl font-semibold text-ink">
              {deployment.name}
            </h3>
            <HealthPill health={deployment.health} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Namespace: {deployment.namespace}
          </p>
          <p className="text-sm text-slate-500">
            Status: {deployment.status}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Replicas" value={`${deployment.readyReplicas ?? "--"}/${deployment.desiredReplicas ?? "--"}`} />
          <Metric label="Services" value={String(services.length)} />
          <Metric label="Ingresses" value={String(ingresses.length)} />
          <Metric
            label="Endpoints"
            value={`${services.reduce((total, service) => total + (service.readyEndpoints ?? 0), 0)}/${services.reduce((total, service) => total + (service.totalEndpoints ?? 0), 0)}`}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="CPU media" value={formatCpuCompact(deployment.history?.cpu.avg)} />
        <Metric label="CPU pico" value={formatCpuCompact(deployment.history?.cpu.max)} />
        <Metric label="RAM media" value={formatMemoryCompact(deployment.history?.memory.avg)} />
        <Metric label="RAM pico" value={formatMemoryCompact(deployment.history?.memory.max)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            rollout {deployment.rolloutDegraded ? "degradado" : "saudavel"}
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            HPA {deployment.autoscaling?.enabled ? "ativo" : "nao configurado"}
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            refs {deployment.references.length}
          </span>
          <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600">
            issues {deployment.topIssues.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={buildResourceHref("Deployment", deployment.namespace, deployment.name)}
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
          >
            Abrir deployment
          </Link>
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Ver grafico
          </button>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {expanded ? "Recolher" : "Ver rede e dependencias"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <SubCard title="Escala e HPA">
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric label="Min/Max" value={`${deployment.autoscaling?.minReplicas ?? "--"}/${deployment.autoscaling?.maxReplicas ?? "--"}`} />
                <Metric label="Atual/Desejado" value={`${deployment.autoscaling?.currentReplicas ?? "--"}/${deployment.autoscaling?.desiredReplicas ?? "--"}`} />
                <Metric label="CPU target" value={deployment.autoscaling?.cpuTargetUtilization !== undefined ? `${deployment.autoscaling.cpuTargetUtilization}%` : "--"} />
              </div>
            </SubCard>

            <SubCard title="Deployment -> Service -> EndpointSlice -> Pod">
              <div className="space-y-3">
                {services.length > 0 ? (
                  services.map((service) => (
                    <div key={service.name} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link
                          href={buildResourceHref("Service", service.namespace, service.name)}
                          className="font-medium text-tide transition hover:text-ember"
                        >
                          Service: {service.name}
                        </Link>
                        <span className="text-sm text-slate-500">
                          {service.readyEndpoints ?? 0}/{service.totalEndpoints ?? 0} endpoints prontos
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Ports: {service.ports.join(", ") || "none"} | Selector: {service.selector ?? "manual"}
                      </p>
                      <div className="mt-3 space-y-2">
                        {service.endpointSlices.map((slice) => (
                          <div key={slice.name} className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Link
                                href={buildResourceHref("EndpointSlice", service.namespace, slice.name)}
                                className="font-medium text-tide transition hover:text-ember"
                              >
                                EndpointSlice: {slice.name}
                              </Link>
                              <span>
                                {slice.readyEndpoints}/{slice.totalEndpoints}
                              </span>
                            </div>
                            {slice.backingPods?.length ? (
                              <p className="mt-1 text-xs text-slate-500">
                                Pods: {slice.backingPods.join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState copy="Nenhum service ligado a este deployment na coleta atual." />
                )}
              </div>
            </SubCard>

            <SubCard title="Deployment -> Service -> Ingress">
              <div className="space-y-3">
                {ingresses.length > 0 ? (
                  ingresses.map((ingress) => (
                    <div key={ingress.name} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link
                          href={buildResourceHref("Ingress", ingress.namespace, ingress.name)}
                          className="font-medium text-tide transition hover:text-ember"
                        >
                          Ingress: {ingress.name}
                        </Link>
                        <span className="text-sm text-slate-500">
                          {ingress.ingressClassName ?? "sem classe"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">
                        Hosts: {ingress.hosts.join(", ") || "none"}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Backends: {ingress.backendServices.join(", ") || "none"}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyState copy="Nenhum ingress ligado a este deployment na coleta atual." />
                )}
              </div>
            </SubCard>
          </div>

          <div className="space-y-4">
            <SubCard title="Dependencias">
              <div className="space-y-2">
                {deployment.references.length > 0 ? (
                  deployment.references.map((reference) => (
                    <div key={`${reference.kind}-${reference.namespace ?? deployment.namespace}-${reference.name}`} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-medium text-ink">
                          {reference.kind}: {reference.name}
                        </p>
                        <Link
                          href={buildResourceHref(reference.kind, reference.namespace ?? deployment.namespace, reference.name)}
                          className="text-sm font-medium text-tide transition hover:text-ember"
                        >
                          Abrir
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState copy="Nenhuma dependencia estrutural mapeada." />
                )}
              </div>
            </SubCard>

            <SubCard title="Riscos, limpeza e inconsistencias">
              <div className="space-y-2">
                {deployment.cleanupSignals.length > 0 ? (
                  deployment.cleanupSignals.map((signal) => (
                    <div key={signal} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {signal}
                    </div>
                  ))
                ) : (
                  <EmptyState copy="Nenhum sinal de limpeza ou inconsistencia apareceu nesta coleta." />
                )}
              </div>
            </SubCard>

            <SubCard title="Principais achados">
              <div className="space-y-3">
                {deployment.topIssues.length > 0 ? (
                  deployment.topIssues.map((issue) => (
                    <div key={issue.id} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <SeverityPill severity={issue.severity} />
                        <span className="rounded-full border border-black/5 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                          {issue.category}
                        </span>
                      </div>
                      <p className="mt-2 font-medium text-ink">{issue.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{issue.summary}</p>
                    </div>
                  ))
                ) : (
                  <EmptyState copy="Nenhum issue agrupado neste deployment." />
                )}
              </div>
            </SubCard>

            <SubCard title="Comandos sugeridos">
              <div className="space-y-2">
                {deployment.suggestedCommands.map((command) => (
                  <pre key={command} className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-sm text-white">
                    <code>{command}</code>
                  </pre>
                ))}
              </div>
            </SubCard>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <DeploymentHistoryModal
          name={deployment.name}
          namespace={deployment.namespace}
          onClose={() => setShowHistory(false)}
        />
      ) : null}
    </article>
  );
}

function SubCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-black/5 bg-white p-4">
      <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
      <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/10 bg-slate-50 px-4 py-4 text-sm text-slate-500">
      {copy}
    </div>
  );
}
