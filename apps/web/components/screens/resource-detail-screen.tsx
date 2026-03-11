"use client";

import Link from "next/link";
import { useState } from "react";
import { Breadcrumbs } from "../ui/breadcrumbs";
import { SectionCard } from "../ui/section-card";
import { StateBanner } from "../ui/state-banner";
import { HealthPill } from "../ui/explorer-pill";
import { SeverityPill, SourcePill } from "../ui/status-pill";
import { buildNamespaceHref, buildResourceHref } from "../../lib/routes";
import type { ResourceDetail } from "../../lib/explorer-types";
import {
  formatCpu,
  formatKindLabel,
  formatMemory,
  formatRelativeTimestamp
} from "../../lib/format";

export function ResourceDetailScreen({
  detail,
  degradedSources
}: {
  detail: ResourceDetail;
  degradedSources: string[];
}) {
  const [showYaml, setShowYaml] = useState(false);
  const { resource } = detail;
  const references = detail.references ?? [];
  const insights = detail.insights ?? [];
  const relatedIssues = detail.issues ?? [];
  const totalReadyEndpoints = (detail.exposure?.services ?? []).reduce(
    (total, service) => total + (service.readyEndpoints ?? 0),
    0
  );
  const totalEndpoints = (detail.exposure?.services ?? []).reduce(
    (total, service) => total + (service.totalEndpoints ?? 0),
    0
  );
  const generatedResources = detail.relations.filter(
    (relation) => relation.target.kind === "ReplicaSet" || relation.target.kind === "Pod"
  );

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Explorer", href: "/explorer" },
          { label: resource.namespace, href: buildNamespaceHref(resource.namespace) },
          { label: resource.name }
        ]}
      />

      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Analise parcial do recurso"
          body={`As fontes ${degradedSources.join(", ")} nao responderam totalmente nesta coleta. Use os comandos sugeridos para confirmar o estado atual.`}
        />
      ) : null}

      <SectionCard
        eyebrow={formatKindLabel(resource.kind)}
        title={resource.name}
        description={resource.summary}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Status" value={resource.status} />
            <Metric
              label="Replicas"
              value={
                resource.ready !== undefined && resource.desired !== undefined
                  ? `${resource.ready}/${resource.desired}`
                  : "--"
              }
            />
            <Metric label="CPU" value={formatCpu(detail.metrics.cpuCores)} />
            <Metric label="Memoria" value={formatMemory(detail.metrics.memoryBytes)} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowYaml(true)}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Ver YAML
            </button>
            <HealthPill health={resource.health} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {resource.labels?.map((label) => (
            <span
              key={`${resource.name}-${label}`}
              className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600"
            >
              {label}
            </span>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Pods ligados" value={String(generatedResources.filter((item) => item.target.kind === "Pod").length)} />
          <Metric label="Services" value={String(detail.exposure?.services?.length ?? 0)} />
          <Metric label="Ingresses" value={String(detail.exposure?.ingresses?.length ?? 0)} />
          <Metric label="Endpoints" value={totalEndpoints ? `${totalReadyEndpoints}/${totalEndpoints}` : "--"} />
          <Metric label="Dependencias" value={String(references.length)} />
          <Metric label="Issues" value={String(relatedIssues.length)} />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6">
          <SectionCard
            eyebrow="Pods gerados"
            title="Rollout e eventos"
            description="O recurso pai vira a trilha principal para entender ReplicaSets, pods, progresso e sintomas recentes."
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Desired" value={String(detail.rollout?.desiredReplicas ?? resource.desired ?? "--")} />
              <Metric label="Ready" value={String(detail.rollout?.readyReplicas ?? resource.ready ?? "--")} />
              <Metric label="Updated" value={String(detail.rollout?.updatedReplicas ?? "--")} />
              <Metric label="Unavailable" value={String(detail.rollout?.unavailableReplicas ?? "--")} />
            </div>

            <div className="mt-5">
              <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-500">
                Pods e ReplicaSets ligados
              </p>
              {generatedResources.length > 0 ? (
                <div className="mt-3 grid gap-3">
                  {generatedResources.map((relation) => (
                    <div
                      key={`${relation.type}-${relation.target.kind}-${relation.target.name}`}
                      className="rounded-3xl border border-black/5 bg-slate-50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-ink">{relation.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{relation.detail}</p>
                        </div>
                        <Link
                          href={buildResourceHref(
                            relation.target.kind,
                            relation.target.namespace,
                            relation.target.name
                          )}
                          className="text-sm font-medium text-tide transition hover:text-ember"
                        >
                          {relation.target.kind}: {relation.target.name}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState copy="Nenhum pod ou ReplicaSet relacionado foi anexado a este detalhe." />
                </div>
              )}
            </div>

            {detail.rollout?.conditions?.length ? (
              <div className="mt-5 grid gap-3">
                {detail.rollout.conditions.map((condition) => (
                  <div key={`${condition.type}-${condition.reason ?? "none"}`} className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                    <p className="font-medium text-ink">
                      {condition.type}: {condition.status}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {condition.reason ?? "Sem reason"} {condition.message ? `| ${condition.message}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {detail.events?.length ? (
              <div className="mt-5 space-y-3">
                {detail.events.slice(0, 5).map((event) => (
                  <div key={`${event.reason}-${event.lastSeen ?? event.message}`} className="rounded-3xl border border-black/5 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-ink">{event.reason}</p>
                      <p className="text-xs text-slate-500">{event.lastSeen ? formatRelativeTimestamp(event.lastSeen) : event.type}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{event.message}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </SectionCard>

          <SectionCard
            eyebrow="Exposicao"
            title="Exposicao: Service, Ingress e Endpoints"
            description="Confirme se o deployment esta realmente ligado ao caminho de trafego esperado."
          >
            <div className="space-y-4">
              {(detail.exposure?.services ?? []).map((service) => (
                <div key={service.name} className="rounded-[1.5rem] border border-black/5 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href={buildResourceHref("Service", service.namespace, service.name)}
                      className="font-semibold text-tide transition hover:text-ember"
                    >
                      Service: {service.name}
                    </Link>
                    <span className="text-sm text-slate-500">{service.type ?? "ClusterIP"}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Ports: {service.ports.join(", ") || "none"} | Selector: {service.selector ?? "manual"}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    Endpoints prontos: {service.readyEndpoints ?? 0}/{service.totalEndpoints ?? 0}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {service.endpointSlices.map((slice) => (
                      <div key={slice.name} className="rounded-2xl border border-black/5 bg-white px-3 py-2 text-xs text-slate-600">
                        <p>
                          {slice.name}: {slice.readyEndpoints}/{slice.totalEndpoints} prontos
                        </p>
                        {slice.backingPods?.length ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Pods: {slice.backingPods.join(", ")}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {(detail.exposure?.ingresses ?? []).map((ingress) => (
                <div key={ingress.name} className="rounded-[1.5rem] border border-black/5 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link
                      href={buildResourceHref("Ingress", ingress.namespace, ingress.name)}
                      className="font-semibold text-tide transition hover:text-ember"
                    >
                      Ingress: {ingress.name}
                    </Link>
                    <span className="text-sm text-slate-500">{ingress.ingressClassName ?? "sem classe"}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Hosts: {ingress.hosts.join(", ") || "none"} | Backends: {ingress.backendServices.join(", ") || "none"}
                  </p>
                  <p className="mt-2 text-sm text-slate-500">
                    TLS: {ingress.tlsSecrets.join(", ") || "none"} | Default backend: {ingress.defaultBackendService ?? "none"}
                  </p>
                </div>
              ))}

              {!detail.exposure?.services?.length && !detail.exposure?.ingresses?.length ? (
                <EmptyState copy="Nenhuma relacao de exposicao foi encontrada nesta coleta." />
              ) : null}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Relacoes do recurso"
            title="Relacoes do recurso"
            description="Use as relacoes para navegar ate o alvo real do problema, sem perder contexto."
          >
            <div className="space-y-3">
              {detail.relations.map((relation) => (
                <div key={`${relation.type}-${relation.target.kind}-${relation.target.name}`} className="rounded-3xl border border-black/5 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium text-ink">{relation.title}</p>
                    <span className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {relation.direction === "outgoing" ? "saida" : "entrada"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{relation.detail}</p>
                  <Link
                    href={buildResourceHref(relation.target.kind, relation.target.namespace, relation.target.name)}
                    className="mt-3 inline-flex text-sm font-medium text-tide transition hover:text-ember"
                  >
                    {relation.target.kind}: {relation.target.name}
                  </Link>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard
            eyebrow="Leituras rapidas"
            title="Contexto operacional do recurso"
            description="Resumos curtos para bater o olho em rollout, dependencia e exposicao antes de investigar fundo."
          >
            {insights.length > 0 ? (
              <div className="space-y-2">
                {insights.map((insight) => (
                  <div key={insight} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {insight}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState copy="Ainda nao houve resumo adicional para este recurso nesta coleta." />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Escala e HPA"
            title="Escala e HPA"
            description="Veja se o autoscaling existe, se bateu no teto e como conversa com o rollout."
          >
            {detail.autoscaling ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="HPA" value={detail.autoscaling.enabled ? detail.autoscaling.name ?? "ativo" : "nao configurado"} />
                  <Metric label="Saturado" value={detail.autoscaling.atMaxReplicas ? "sim" : "nao"} />
                  <Metric label="Min/Max" value={`${detail.autoscaling.minReplicas ?? "--"} / ${detail.autoscaling.maxReplicas ?? "--"}`} />
                  <Metric label="Atual/Desejado" value={`${detail.autoscaling.currentReplicas ?? "--"} / ${detail.autoscaling.desiredReplicas ?? "--"}`} />
                  <Metric label="CPU atual/target" value={renderTarget(detail.autoscaling.currentCpuUtilization, detail.autoscaling.cpuTargetUtilization)} />
                  <Metric label="Mem atual/target" value={renderTarget(detail.autoscaling.currentMemoryUtilization, detail.autoscaling.memoryTargetUtilization)} />
                </div>
                {detail.autoscaling.conditions.length > 0 ? (
                  <div className="space-y-2">
                    {detail.autoscaling.conditions.map((condition) => (
                      <div key={`${condition.type}-${condition.reason ?? "none"}`} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                        <p className="font-medium text-ink">
                          {condition.type}: {condition.status}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {condition.reason ?? "Sem reason"} {condition.message ? `| ${condition.message}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <EmptyState copy="Nenhuma configuracao de autoscaling apareceu para este recurso." />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Config e storage"
            title="ConfigMaps, secrets e volumes consumidos"
            description="Essa trilha ajuda a achar dependencia quebrada, config esquecida e storage sem dono."
          >
            {references.length > 0 ? (
              <div className="space-y-3">
                {references.map((reference) => (
                  <div key={`${reference.kind}-${reference.namespace ?? "_cluster"}-${reference.name}`} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">
                          {reference.kind}: {reference.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Namespace: {reference.namespace ?? resource.namespace}
                        </p>
                      </div>
                      <Link
                        href={buildResourceHref(reference.kind, reference.namespace ?? resource.namespace, reference.name)}
                        className="text-sm font-medium text-tide transition hover:text-ember"
                      >
                        Abrir dependencia
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState copy="Nenhuma dependencia estrutural foi mapeada nesta coleta." />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Agendamento e identidade"
            title="Onde e como o workload roda"
            description="Node selection, service account e segredos de pull ajudam a explicar agendamento e falhas de imagem."
          >
            <div className="space-y-3 text-sm text-slate-600">
              <KeyValue label="ServiceAccount" value={detail.scheduling?.serviceAccountName ?? "default"} />
              <KeyValue label="Image pull secrets" value={detail.scheduling?.imagePullSecrets.join(", ") || "none"} />
              <KeyValue label="Node selector" value={detail.scheduling?.nodeSelector.join(", ") || "none"} />
              <KeyValue label="Tolerations" value={detail.scheduling?.tolerations.join(" | ") || "none"} />
              <KeyValue label="Affinity" value={detail.scheduling?.affinitySummary.join(" | ") || "none"} />
              <KeyValue label="Topology spread" value={detail.scheduling?.topologySpread.join(" | ") || "none"} />
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Riscos e melhorias"
            title="Riscos e melhorias"
            description="Aqui ficam os sinais que mais influenciam disponibilidade e recuperacao automatica."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Readiness" value={detail.resilience?.hasReadinessProbe ? "sim" : "nao"} />
              <Metric label="Liveness" value={detail.resilience?.hasLivenessProbe ? "sim" : "nao"} />
              <Metric label="Startup" value={detail.resilience?.hasStartupProbe ? "sim" : "nao"} />
              <Metric label="PDB" value={detail.resilience?.hasPodDisruptionBudget ? "sim" : "nao"} />
            </div>
            {detail.resilience?.podDisruptionBudgets?.length ? (
              <div className="mt-4 space-y-2">
                {detail.resilience.podDisruptionBudgets.map((pdb) => (
                  <div key={`${pdb.namespace ?? resource.namespace}-${pdb.name}`} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="font-medium text-ink">
                      PDB {pdb.name}
                    </p>
                    <p className="mt-1">
                      minAvailable: {pdb.minAvailable ?? "--"} | maxUnavailable: {pdb.maxUnavailable ?? "--"} | disruptionsAllowed: {pdb.disruptionsAllowed ?? "--"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
              {(detail.resilience?.risks ?? []).map((risk) => (
                <div key={risk} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {risk}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Limpeza e inconsistencias"
            title="Limpeza e inconsistencias"
            description="Esses itens apontam para recursos possivelmente orfaos ou historico acumulado."
          >
            {(detail.cleanupSignals ?? []).length ? (
              <div className="space-y-2">
                {detail.cleanupSignals?.map((signal) => (
                  <div key={signal} className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {signal}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState copy="Nenhum sinal de lixo ou inconsistencia apareceu para este recurso." />
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Achados ligados ao recurso"
            title="Diagnosticos agrupados no recurso pai"
            description="O foco aqui e explicar impacto, evidencia e proximo passo, em vez de pulverizar alertas por pod."
          >
            <div className="space-y-3">
              {detail.issues.map((issue) => (
                <div key={issue.id} className="rounded-[1.5rem] border border-black/5 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityPill severity={issue.severity} />
                    <SourcePill source={issue.source} />
                    <span className="rounded-full border border-black/5 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                      {issue.category}
                    </span>
                  </div>
                  <p className="mt-3 font-medium text-ink">{issue.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{issue.summary}</p>
                  {issue.resourceRef ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Alvo: {issue.resourceRef.kind} {issue.resourceRef.namespace ? `${issue.resourceRef.namespace}/` : ""}{issue.resourceRef.name}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Historico local"
            title="Mudancas entre coletas"
            description="Diffs locais ajudam a separar erro novo de ruido cronico."
          >
            <div className="space-y-3">
              {detail.history.map((entry) => (
                <div key={entry.id} className="rounded-3xl border border-black/5 bg-white p-4">
                  <p className="font-medium text-ink">{entry.title}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-500">
                    {formatRelativeTimestamp(entry.timestamp)}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">{entry.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Comandos sugeridos"
            title="Investigacao manual segura"
            description="Tudo continua read-only: comandos para revisar, nunca aplicar mudanca automatica."
          >
            <div className="space-y-2">
              {detail.suggestedCommands.map((command) => (
                <pre key={command} className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-sm text-white">
                  <code>{command}</code>
                </pre>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {showYaml ? (
        <YamlModal
          title={`${resource.kind} ${resource.name}`}
          yaml={detail.manifestYaml}
          onClose={() => setShowYaml(false)}
        />
      ) : null}
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

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3">
      <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm text-ink">{value}</p>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/10 bg-slate-50 px-4 py-5 text-sm text-slate-500">
      {copy}
    </div>
  );
}

function renderTarget(current?: number, target?: number) {
  if (current === undefined && target === undefined) {
    return "--";
  }

  return `${current ?? "--"}% / ${target ?? "--"}%`;
}

function YamlModal({
  title,
  yaml,
  onClose
}: {
  title: string;
  yaml?: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/55 px-4 py-6 sm:py-10" onClick={onClose}>
      <div className="mx-auto w-full max-w-5xl">
        <div
          className="flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl sm:max-h-[calc(100vh-5rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                Manifesto do recurso
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-ink">{title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>

          <div className="overflow-auto bg-ink px-5 py-5">
            {yaml ? (
              <YamlCodeBlock yaml={yaml} />
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/75">
                O YAML bruto ainda nao esta disponivel para este recurso nesta coleta.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function YamlCodeBlock({ yaml }: { yaml: string }) {
  const lines = yaml.replace(/\r\n/g, "\n").split("\n");

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06111d]">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#091826] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-rose-400" />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-white/45">
          YAML
        </p>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${index}-${line}`} className="align-top odd:bg-white/[0.02]">
                <td className="select-none border-r border-white/5 px-4 py-1 text-right font-[var(--font-mono)] text-xs text-white/30">
                  {index + 1}
                </td>
                <td className="px-4 py-1 font-[var(--font-mono)] text-sm">
                  <YamlLine line={line} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function YamlLine({ line }: { line: string }) {
  if (!line.trim()) {
    return <span className="text-white/25">&nbsp;</span>;
  }

  const indent = line.match(/^\s*/)?.[0] ?? "";
  const content = line.slice(indent.length);
  const listPrefix = content.startsWith("- ") ? "- " : "";
  const body = listPrefix ? content.slice(2) : content;
  const keyMatch = body.match(/^([^:#]+):(.*)$/);

  return (
    <span className="whitespace-pre-wrap break-words text-white/90">
      <span className="text-white/25">{indent}</span>
      {listPrefix ? <span className="text-cyan-300">{listPrefix}</span> : null}
      {keyMatch ? (
        <>
          <span className="text-sky-300">{keyMatch[1]}</span>
          <span className="text-white/55">:</span>
          {keyMatch[2] ? (
            <>
              <span className="text-white/35"> </span>
              <YamlValue value={keyMatch[2].trimStart()} />
            </>
          ) : null}
        </>
      ) : (
        <YamlValue value={body} />
      )}
    </span>
  );
}

function YamlValue({ value }: { value: string }) {
  if (!value) {
    return null;
  }

  if (value === "|" || value === "|-" || value === ">" || value === ">-") {
    return <span className="text-fuchsia-300">{value}</span>;
  }

  if (value === "true" || value === "false" || value === "null") {
    return <span className="text-fuchsia-300">{value}</span>;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return <span className="text-amber-300">{value}</span>;
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    value === "<redacted>"
  ) {
    return <span className="text-emerald-300">{value}</span>;
  }

  return <span className="text-white/88">{value}</span>;
}
