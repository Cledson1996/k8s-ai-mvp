"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { NodeHealth } from "@k8s-ai-mvp/shared";
import { buildResourceHref } from "../../lib/routes";
import {
  formatCpu,
  formatCpuCompact,
  formatMemory,
  formatMemoryCompact,
  formatPercent,
} from "../../lib/format";
import { NodeHistoryModal } from "../ui/history-metrics-modal";
import { NodeAnalysisDrawer } from "../ui/node-analysis-drawer";
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
        title="Capacidade total, consumo e distribuicao por node"
        description="Leitura operacional por node para localizar gargalos de CPU, memoria, armazenamento e concentracao de workloads."
      >
        {nodes.length > 0 ? (
          <div className="space-y-4">
            {nodes.map((node) => (
              <NodeCard key={node.name} node={node} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-black/10 bg-slate-50 px-5 py-8 text-sm text-slate-500">
            Nenhum node foi carregado desta coleta. Se a API acabou de reiniciar, atualize a pagina apos alguns segundos.
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function NodeCard({ node }: { node: NodeHealth }) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const workloadList = node.workloads ?? node.topWorkloads ?? [];
  const cpuCapacity = node.capacity?.cpu ?? {};
  const memoryCapacity = node.capacity?.memory ?? {};
  const storageCapacity = node.capacity?.storage ?? {};
  const workloads = useMemo(
    () =>
      [...workloadList].sort(
        (left, right) =>
          (right.cpuCores ?? 0) - (left.cpuCores ?? 0) ||
          (right.memoryBytes ?? 0) - (left.memoryBytes ?? 0)
      ),
    [workloadList]
  );
  const visibleWorkloads = expanded ? workloads : workloads.slice(0, 5);
  const badges = buildNodeBadges(node);

  return (
    <article className="rounded-[1.5rem] border border-black/5 bg-gradient-to-r from-white to-orange-50 p-5">
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
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.length > 0 ? (
              badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900"
                >
                  {badge}
                </span>
              ))
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                node equilibrado
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="CPU usada" value={formatCpu(node.usage.cpuCores)} />
          <Metric label="Mem usada" value={formatMemory(node.usage.memoryBytes)} />
          <Metric label="Pods" value={String(node.podCount)} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="CPU media" value={formatCpuCompact(node.history?.cpu.avg)} />
        <Metric label="CPU pico" value={formatCpuCompact(node.history?.cpu.max)} />
        <Metric label="RAM media" value={formatMemoryCompact(node.history?.memory.avg)} />
        <Metric label="RAM pico" value={formatMemoryCompact(node.history?.memory.max)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={buildResourceHref("Node", "_cluster", node.name)}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
        >
          Abrir node
        </Link>
        <button
          type="button"
          onClick={() => setShowAnalysis(true)}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Analisar node
        </button>
        <button
          type="button"
          onClick={() => setShowHistory(true)}
          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Ver grafico
        </button>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <CapacityPanel
            title="CPU"
            total={formatCpu(cpuCapacity.total)}
            used={formatCpu(cpuCapacity.used)}
            available={formatCpu(cpuCapacity.available)}
            percent={node.usage.cpuPercent}
          />
          <CapacityPanel
            title="Memoria"
            total={formatMemory(memoryCapacity.total)}
            used={formatMemory(memoryCapacity.used)}
            available={formatMemory(memoryCapacity.available)}
            percent={node.usage.memoryPercent}
          />
          <CapacityPanel
            title="Armazenamento"
            total={formatMemory(storageCapacity.total)}
            used={formatMemory(storageCapacity.used)}
            available={formatMemory(storageCapacity.available)}
            percent={
              storageCapacity.total !== undefined &&
              storageCapacity.used !== undefined
                ? (storageCapacity.used / storageCapacity.total) * 100
                : undefined
            }
            unavailableCopy="Uso indisponivel"
          />

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
        </div>

        <div className="rounded-3xl bg-ink px-4 py-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Todos os workloads do node
              </p>
              <p className="mt-2 text-sm text-white/70">
                Ordenados por consumo para facilitar hotspot, mas com visao completa do node.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              {expanded ? "Mostrar menos" : "Mostrar todos"}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {visibleWorkloads.map((workload) => (
              <div
                key={workload.key ?? `${workload.kind}:${workload.namespace}/${workload.name}`}
                className="rounded-2xl border border-white/10 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{workload.name}</p>
                    <p className="text-sm text-white/70">
                      {workload.namespace} - {workload.kind}
                    </p>
                  </div>
                  <Link
                    href={buildResourceHref(workload.kind, workload.namespace, workload.name)}
                    className="text-sm font-medium text-glow transition hover:text-white"
                  >
                    Abrir recurso
                  </Link>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-5">
                  <CompactMetric label="CPU" value={formatCpu(workload.cpuCores)} />
                  <CompactMetric label="Mem" value={formatMemory(workload.memoryBytes)} />
                  <CompactMetric
                    label="Replicas"
                    value={
                      workload.replicas !== undefined || workload.readyReplicas !== undefined
                        ? `${workload.readyReplicas ?? "--"}/${workload.replicas ?? "--"}`
                        : "--"
                    }
                  />
                  <CompactMetric label="Restarts" value={String(workload.restartCount ?? 0)} />
                  <CompactMetric label="Issues" value={String(workload.issueCount ?? 0)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showHistory ? (
        <NodeHistoryModal
          name={node.name}
          onClose={() => setShowHistory(false)}
        />
      ) : null}
      {showAnalysis ? (
        <NodeAnalysisDrawer
          name={node.name}
          onClose={() => setShowAnalysis(false)}
        />
      ) : null}
    </article>
  );
}

function CapacityPanel({
  title,
  total,
  used,
  available,
  percent,
  unavailableCopy
}: {
  title: string;
  total: string;
  used: string;
  available: string;
  percent?: number;
  unavailableCopy?: string;
}) {
  const usedValue = used === "--" ? unavailableCopy ?? "--" : used;
  const availableValue = available === "--" ? unavailableCopy ?? "--" : available;

  return (
    <div className="rounded-3xl bg-white px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
          {title}
        </p>
        <span className="text-sm text-slate-500">{formatPercent(percent)}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label="Total" value={total} />
        <Metric label="Usado" value={usedValue} />
        <Metric label="Disponivel" value={availableValue} />
      </div>
    </div>
  );
}

function buildNodeBadges(node: NodeHealth) {
  const badges: string[] = [];
  const storageCapacity = node.capacity?.storage ?? {};

  if ((node.usage.cpuPercent ?? 0) >= 85) {
    badges.push("cpu alta");
  }
  if ((node.usage.memoryPercent ?? 0) >= 85) {
    badges.push("memoria alta");
  }
  const storagePercent =
    storageCapacity.total !== undefined && storageCapacity.used !== undefined
      ? (storageCapacity.used / storageCapacity.total) * 100
      : undefined;
  if (storagePercent !== undefined && storagePercent >= 85) {
    badges.push("storage alto");
  }
  if (node.pressure.length > 0) {
    badges.push("pressao do kubelet");
  }

  return badges;
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

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
      <p className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.24em] text-white/50">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
    </div>
  );
}
