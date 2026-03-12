"use client";

import { useState } from "react";
import type {
  WorkloadCardSummary,
  WorkloadPodDetail,
  WorkloadsResponse,
} from "@k8s-ai-mvp/shared";
import { formatCpu, formatMemory } from "../../lib/format";
import { ModalPortal } from "../ui/modal-portal";

// â”€â”€â”€ Status colour map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_COLORS: Record<string, string> = {
  Running: "#22c55e",
  Succeeded: "#0d4f52",
  Pending: "#f59e0b",
  Failed: "#ef4444",
  Terminated: "#6366f1",
  Unknown: "#94a3b8",
  CrashLoopBackOff: "#ef4444",
  Scheduled: "#22c55e",
  Suspended: "#94a3b8",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "#94a3b8";
}

// â”€â”€â”€ Icon per workload kind â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const KIND_ICONS: Record<string, string> = {
  Pod: "â¬¡",
  ReplicaSet: "âŸ³",
  Deployment: "â–²",
  StatefulSet: "â—ˆ",
  DaemonSet: "â—‰",
  Job: "â–·",
  CronJob: "â—·",
};

// â”€â”€â”€ Status-bar gauge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatusBar({
  statuses,
  total,
}: {
  statuses: WorkloadCardSummary["statuses"];
  total: number;
}) {
  if (total === 0)
    return <div className="mt-3 h-2 w-full rounded-full bg-slate-100" />;

  return (
    <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
      {statuses.map(({ status, count }) => (
        <div
          key={status}
          title={`${status}: ${count}`}
          style={{
            width: `${(count / total) * 100}%`,
            background: statusColor(status),
          }}
        />
      ))}
    </div>
  );
}

// â”€â”€â”€ Status legend chips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatusChips({
  statuses,
}: {
  statuses: WorkloadCardSummary["statuses"];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {statuses.map(({ status, count }) => (
        <span
          key={status}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            background: `${statusColor(status)}18`,
            color: statusColor(status),
          }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: statusColor(status) }}
          />
          {status}: {count}
        </span>
      ))}
    </div>
  );
}

// â”€â”€â”€ Workload card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function WorkloadCard({
  card,
  isActive,
  onClick,
  hasPodTable,
}: {
  card: WorkloadCardSummary;
  isActive: boolean;
  onClick?: () => void;
  hasPodTable: boolean;
}) {
  const icon = KIND_ICONS[card.kind] ?? "â—»";
  const isClickable = hasPodTable && onClick;

  return (
    <article
      onClick={isClickable ? onClick : undefined}
      className={[
        "rounded-3xl border p-5 transition-all",
        isActive
          ? "border-tide bg-tide/5 shadow-lg shadow-tide/10 ring-1 ring-tide/30"
          : isClickable
            ? "cursor-pointer border-black/5 bg-white hover:-translate-y-0.5 hover:border-tide/40 hover:bg-tide/5 hover:shadow-md"
            : "border-black/5 bg-white",
      ].join(" ")}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-400">
            {icon} {card.label}
          </p>
          <p className="mt-2 font-[var(--font-heading)] text-4xl font-semibold text-ink">
            {card.total}
          </p>
        </div>
        {isClickable && (
          <span
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium transition",
              isActive ? "bg-tide text-white" : "bg-slate-100 text-slate-500",
            ].join(" ")}
          >
            {isActive ? "Aberto" : "Ver tabela â†’"}
          </span>
        )}
      </div>
      <StatusBar statuses={card.statuses} total={card.total} />
      <StatusChips statuses={card.statuses} />
    </article>
  );
}

// â”€â”€â”€ Status pill for table rows â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function PodStatusPill({ phase, reason }: { phase: string; reason?: string }) {
  const label = reason ?? phase;
  const color = statusColor(
    label === "CrashLoopBackOff" ? "CrashLoopBackOff" : phase,
  );
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: `${color}18`, color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

// â”€â”€â”€ Events modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function EventsModal({
  pod,
  onClose,
}: {
  pod: WorkloadPodDetail;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6">
        <div className="absolute inset-0" onClick={onClose} />
        <div className="relative z-10 flex h-[80vh] max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-halo">
          <div className="shrink-0 border-b border-black/5 px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-400">
                  Eventos do pod
                </p>
                <h2 className="mt-1 font-[var(--font-heading)] text-xl font-semibold text-ink">
                  {pod.name}
                </h2>
                <p className="text-sm text-slate-500">{pod.namespace}</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {pod.events.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-400">
                  Nenhum evento registrado para este pod.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pod.events.map((event, idx) => {
                  const isWarning = event.type === "Warning";
                  return (
                    <div
                      key={idx}
                      className={[
                        "rounded-2xl border p-4",
                        isWarning
                          ? "border-amber-200 bg-amber-50"
                          : "border-black/5 bg-slate-50",
                      ].join(" ")}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            isWarning
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700",
                          ].join(" ")}
                        >
                          {event.type}
                        </span>
                        <span className="font-mono text-xs font-medium text-slate-600">
                          {event.reason}
                        </span>
                        {event.count && event.count > 1 ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500">
                            x{event.count}
                          </span>
                        ) : null}
                        {event.lastSeen ? (
                          <span className="ml-auto text-xs text-slate-400">
                            {event.lastSeen}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        {event.message}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

// â”€â”€â”€ Pods table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SortKey =
  | "name"
  | "namespace"
  | "phase"
  | "nodeName"
  | "controllerName"
  | "cpuCores"
  | "memoryBytes"
  | "restarts"
  | "age";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

function sortPods(
  pods: WorkloadPodDetail[],
  key: SortKey,
  dir: SortDir,
): WorkloadPodDetail[] {
  return [...pods].sort((a, b) => {
    let valA: string | number = "";
    let valB: string | number = "";

    switch (key) {
      case "name":
        valA = a.name;
        valB = b.name;
        break;
      case "namespace":
        valA = a.namespace;
        valB = b.namespace;
        break;
      case "phase":
        valA = a.phase;
        valB = b.phase;
        break;
      case "nodeName":
        valA = a.nodeName ?? "";
        valB = b.nodeName ?? "";
        break;
      case "controllerName":
        valA = a.controllerName ?? "";
        valB = b.controllerName ?? "";
        break;
      case "cpuCores":
        valA = a.cpuCores ?? 0;
        valB = b.cpuCores ?? 0;
        break;
      case "memoryBytes":
        valA = a.memoryBytes ?? 0;
        valB = b.memoryBytes ?? 0;
        break;
      case "restarts":
        valA = a.restarts;
        valB = b.restarts;
        break;
      case "age":
        valA = a.age;
        valB = b.age;
        break;
    }

    if (typeof valA === "number" && typeof valB === "number") {
      return dir === "asc" ? valA - valB : valB - valA;
    }
    const cmp = String(valA).localeCompare(String(valB));
    return dir === "asc" ? cmp : -cmp;
  });
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span
      className={[
        "ml-1 transition",
        active ? "opacity-100" : "opacity-30",
      ].join(" ")}
    >
      {active && dir === "desc" ? "â†“" : "â†‘"}
    </span>
  );
}

function PodsTable({ pods }: { pods: WorkloadPodDetail[] }) {
  const [selectedPod, setSelectedPod] = useState<WorkloadPodDetail | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const filtered = pods.filter((pod) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      pod.name.toLowerCase().includes(q) ||
      pod.namespace.toLowerCase().includes(q) ||
      (pod.nodeName ?? "").toLowerCase().includes(q) ||
      (pod.controllerName ?? "").toLowerCase().includes(q)
    );
  });

  const sorted = sortPods(filtered, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const cols: { label: string; key: SortKey | null }[] = [
    { label: "Nome", key: "name" },
    { label: "Namespace", key: "namespace" },
    { label: "Status", key: "phase" },
    { label: "Node", key: "nodeName" },
    { label: "Controller", key: "controllerName" },
    { label: "CPU", key: "cpuCores" },
    { label: "MemÃ³ria", key: "memoryBytes" },
    { label: "Restarts", key: "restarts" },
    { label: "Idade", key: "age" },
    { label: "", key: null },
  ];

  return (
    <>
      {selectedPod && (
        <EventsModal pod={selectedPod} onClose={() => setSelectedPod(null)} />
      )}

      {/* search + counter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Filtrar por nome, namespace, node ou controllerâ€¦"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-full max-w-sm rounded-2xl border border-black/10 bg-white px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-tide/40 focus:outline-none focus:ring-1 focus:ring-tide/30"
        />
        <p className="ml-auto shrink-0 text-sm text-slate-400">
          {filtered.length} pod{filtered.length !== 1 ? "s" : ""}
          {totalPages > 1 && ` Â· pÃ¡g. ${currentPage}/${totalPages}`}
        </p>
      </div>

      {/* table */}
      <div className="overflow-x-auto rounded-3xl border border-black/5 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/5 bg-slate-50/60">
              {cols.map(({ label, key }) => (
                <th
                  key={label}
                  onClick={key ? () => handleSort(key) : undefined}
                  className={[
                    "px-4 py-3 text-left font-[var(--font-mono)] text-xs uppercase tracking-[0.22em] text-slate-400 first:pl-6 last:pr-6",
                    key
                      ? "cursor-pointer select-none hover:text-slate-600"
                      : "",
                    key && sortKey === key ? "text-tide" : "",
                  ].join(" ")}
                >
                  {label}
                  {key && (
                    <SortIndicator active={sortKey === key} dir={sortDir} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-slate-400">
                  Nenhum pod encontrado.
                </td>
              </tr>
            ) : (
              paginated.map((pod) => (
                <tr
                  key={`${pod.namespace}/${pod.name}`}
                  className="transition hover:bg-slate-50/60"
                >
                  <td className="pl-6 pr-4 py-3">
                    <span
                      className="block max-w-[220px] truncate font-medium text-ink"
                      title={pod.name}
                    >
                      {pod.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="block max-w-[140px] truncate text-slate-500"
                      title={pod.namespace}
                    >
                      {pod.namespace}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <PodStatusPill phase={pod.phase} reason={pod.reason} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="block max-w-[160px] truncate font-mono text-xs text-slate-500"
                      title={pod.nodeName ?? "â€”"}
                    >
                      {pod.nodeName ?? "â€”"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {pod.controllerKind ? (
                      <span
                        className="inline-flex flex-col"
                        title={`${pod.controllerKind}/${pod.controllerName}`}
                      >
                        <span className="font-mono text-xs text-slate-400">
                          {pod.controllerKind}
                        </span>
                        <span className="block max-w-[160px] truncate text-xs font-medium text-slate-600">
                          {pod.controllerName}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-300">â€”</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {formatCpu(pod.cpuCores)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {formatMemory(pod.memoryBytes)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "font-[var(--font-heading)] text-base font-semibold",
                        pod.restarts > 0 ? "text-ember" : "text-slate-400",
                      ].join(" ")}
                    >
                      {pod.restarts}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {pod.age}
                  </td>
                  <td className="pr-6 pl-4 py-3">
                    <button
                      onClick={() => setSelectedPod(pod)}
                      className="rounded-xl border border-black/5 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-tide/40 hover:bg-tide/5 hover:text-tide"
                    >
                      Eventos
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-xl border border-black/5 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            â† Anterior
          </button>

          {/* page numbers â€” show up to 7 pills */}
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(
                (n) =>
                  n === 1 || n === totalPages || Math.abs(n - currentPage) <= 2,
              )
              .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                if (idx > 0 && n - (arr[idx - 1] as number) > 1)
                  acc.push("...");
                acc.push(n);
                return acc;
              }, [])
              .map((n, i) =>
                n === "..." ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 py-1 text-sm text-slate-400"
                  >
                    â€¦
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n as number)}
                    className={[
                      "min-w-[2rem] rounded-xl border px-2 py-1.5 text-sm font-medium transition",
                      currentPage === n
                        ? "border-tide bg-tide text-white"
                        : "border-black/5 bg-white text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {n}
                  </button>
                ),
              )}
          </div>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-black/5 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            PrÃ³xima â†’
          </button>
        </div>
      )}
    </>
  );
}

// â”€â”€â”€ Main screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function WorkloadsScreen({
  cards,
  pods,
  degradedSources,
}: WorkloadsResponse) {
  const [activeCard, setActiveCard] = useState<string | null>(null);

  const podsCard = cards.find((c) => c.kind === "Pod");

  const handleCardClick = (kind: string) => {
    if (kind !== "Pod") return;
    setActiveCard((prev) => (prev === kind ? null : kind));
  };

  return (
    <div className="space-y-6">
      {/* degraded banner */}
      {degradedSources.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-medium text-amber-700">
            Algumas fontes estÃ£o degradadas:{" "}
            <span className="font-normal">{degradedSources.join(", ")}</span>
          </p>
        </div>
      )}

      {/* header */}
      <div>
        <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.32em] text-slate-400">
          Workloads
        </p>
        <h2 className="mt-1 font-[var(--font-heading)] text-2xl font-semibold text-ink">
          VisÃ£o de controllers e pods
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Clique no card de Pods para inspecionar a tabela detalhada.
        </p>
      </div>

      {/* cards grid â€” 2 cols matching reference image */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <WorkloadCard
            key={card.kind}
            card={card}
            isActive={activeCard === card.kind}
            onClick={() => handleCardClick(card.kind)}
            hasPodTable={card.kind === "Pod"}
          />
        ))}
      </div>

      {/* pods table â€” shown when Pods card is active */}
      {activeCard === "Pod" && podsCard && (
        <section>
          <div className="mb-4">
            <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-400">
              â¬¡ Pods
            </p>
            <h3 className="mt-1 font-[var(--font-heading)] text-xl font-semibold text-ink">
              {podsCard.total} pods no cluster
            </h3>
          </div>
          <PodsTable pods={pods} />
        </section>
      )}
    </div>
  );
}

