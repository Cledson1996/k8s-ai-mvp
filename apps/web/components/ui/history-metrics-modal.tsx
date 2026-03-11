"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  DeploymentMetricsResponse,
  MetricWindow,
  NodeMetricsResponse,
  ResourceHistorySeries,
  TimeSeriesPoint,
  UsageHistorySummary,
} from "../../lib/explorer-types";
import {
  formatCpuCompact,
  formatMemoryCompact,
  formatMetricTimestamp,
} from "../../lib/format";
import { getDeploymentMetrics, getNodeMetrics } from "../../lib/history-api";
import { StateBanner } from "./state-banner";

const WINDOW_OPTIONS: MetricWindow[] = ["1h", "6h", "24h", "7d"];
const SERIES_COLORS = [
  "#5eead4",
  "#38bdf8",
  "#f59e0b",
  "#a78bfa",
  "#fb7185",
  "#4ade80",
  "#f97316",
  "#22d3ee",
];

export function DeploymentHistoryModal({
  name,
  namespace,
  onClose,
}: {
  name: string;
  namespace: string;
  onClose: () => void;
}) {
  const [window, setWindow] = useState<MetricWindow>("7d");
  const [data, setData] = useState<DeploymentMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await getDeploymentMetrics(namespace, name, window);
        if (!cancelled) {
          setData(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setData(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Nao foi possivel carregar as metricas do deployment.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [name, namespace, window]);

  return (
    <HistoryModalShell
      title={`Uso historico: ${name}`}
      subtitle={`Deployment em ${namespace}`}
      window={window}
      onWindowChange={setWindow}
      onClose={onClose}
    >
      {loading ? (
        <LoadingState copy="Carregando historico do deployment no Prometheus..." />
      ) : error ? (
        <EmptyState copy={error} />
      ) : data ? (
        <HistoryContent
          summary={data.summary}
          degradedSources={data.degradedSources}
          cpuSeries={[data.cpu.aggregate, ...data.cpu.pods]}
          memorySeries={[data.memory.aggregate, ...data.memory.pods]}
          window={data.window}
        />
      ) : (
        <EmptyState copy="Nenhuma metrica historica apareceu para este deployment." />
      )}
    </HistoryModalShell>
  );
}

export function NodeHistoryModal({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [window, setWindow] = useState<MetricWindow>("7d");
  const [data, setData] = useState<NodeMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await getNodeMetrics(name, window);
        if (!cancelled) {
          setData(response);
        }
      } catch (loadError) {
        if (!cancelled) {
          setData(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Nao foi possivel carregar as metricas do node.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [name, window]);

  return (
    <HistoryModalShell
      title={`Uso historico: ${name}`}
      subtitle="Node agregado"
      window={window}
      onWindowChange={setWindow}
      onClose={onClose}
    >
      {loading ? (
        <LoadingState copy="Carregando historico do node no Prometheus..." />
      ) : error ? (
        <EmptyState copy={error} />
      ) : data ? (
        <HistoryContent
          summary={data.summary}
          degradedSources={data.degradedSources}
          cpuSeries={[data.cpu]}
          memorySeries={[data.memory]}
          window={data.window}
        />
      ) : (
        <EmptyState copy="Nenhuma metrica historica apareceu para este node." />
      )}
    </HistoryModalShell>
  );
}

function HistoryModalShell({
  title,
  subtitle,
  window,
  onWindowChange,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  window: MetricWindow;
  onWindowChange: (window: MetricWindow) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/55 px-4 py-6 sm:py-10"
      onClick={onClose}
    >
      <div className="mx-auto w-full max-w-6xl">
        <div
          className="flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl sm:max-h-[calc(100vh-5rem)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                Metricas historicas
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-ink">
                {title}
              </h3>
              <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-black/10 bg-slate-50 p-1">
                {WINDOW_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onWindowChange(option)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      option === window
                        ? "bg-ink text-white"
                        : "text-slate-600 hover:bg-white"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>

          <div className="overflow-auto bg-[#f7f5ef] px-5 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function HistoryContent({
  summary,
  degradedSources,
  cpuSeries,
  memorySeries,
  window,
}: {
  summary: UsageHistorySummary;
  degradedSources: string[];
  cpuSeries: ResourceHistorySeries[];
  memorySeries: ResourceHistorySeries[];
  window: MetricWindow;
}) {
  return (
    <div className="space-y-5">
      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Historico parcial"
          body={`As fontes ${degradedSources.join(", ")} nao responderam completamente nesta janela.`}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryMetric label="CPU media" value={formatCpuCompact(summary.cpu.avg)} />
        <SummaryMetric label="CPU pico" value={formatCpuCompact(summary.cpu.max)} />
        <SummaryMetric label="RAM media" value={formatMemoryCompact(summary.memory.avg)} />
        <SummaryMetric label="RAM pico" value={formatMemoryCompact(summary.memory.max)} />
      </div>

      <MetricChartCard
        title="CPU ao longo do tempo"
        formatter={formatCpuCompact}
        window={window}
        series={cpuSeries}
      />
      <MetricChartCard
        title="Memoria ao longo do tempo"
        formatter={formatMemoryCompact}
        window={window}
        series={memorySeries}
      />
    </div>
  );
}

function MetricChartCard({
  title,
  formatter,
  window,
  series,
}: {
  title: string;
  formatter: (value?: number) => string;
  window: MetricWindow;
  series: ResourceHistorySeries[];
}) {
  const visibleSeries = useMemo(
    () => series.filter((item) => item.points.length > 0),
    [series],
  );

  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
            Serie temporal
          </p>
          <h4 className="mt-2 font-[var(--font-heading)] text-lg font-semibold text-ink">
            {title}
          </h4>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {visibleSeries.length} serie{visibleSeries.length === 1 ? "" : "s"}
        </span>
      </div>

      {visibleSeries.length > 0 ? (
        <>
          <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-black/5 bg-[#06111d] p-4">
            <TimeSeriesChart
              formatter={formatter}
              window={window}
              series={visibleSeries}
            />
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visibleSeries.map((item, index) => (
              <div
                key={item.key}
                className="rounded-2xl border border-black/5 bg-slate-50 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: pickSeriesColor(index) }}
                  />
                  <p className="text-sm font-medium text-ink">{item.label}</p>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Ultimo ponto:{" "}
                  {formatter(item.points[item.points.length - 1]?.value)}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState copy="O Prometheus nao retornou serie suficiente para desenhar o grafico nesta janela." />
      )}
    </div>
  );
}

function TimeSeriesChart({
  formatter,
  window,
  series,
}: {
  formatter: (value?: number) => string;
  window: MetricWindow;
  series: ResourceHistorySeries[];
}) {
  const width = 880;
  const height = 280;
  const padding = { top: 16, right: 20, bottom: 36, left: 56 };
  const allPoints = series.flatMap((item) => item.points);
  const referencePoints = series.find((item) => item.points.length > 0)?.points ?? [];
  const values = allPoints.map((point) => point.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const timestamps = allPoints.map((point) => new Date(point.timestamp).getTime());
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const yTicks = buildYTicks(minValue, maxValue);
  const xTickIndices = buildXTickIndices(referencePoints.length);

  function scaleX(timestamp: string) {
    const value = new Date(timestamp).getTime();
    if (maxTimestamp === minTimestamp) {
      return padding.left;
    }

    return (
      padding.left +
      ((value - minTimestamp) / (maxTimestamp - minTimestamp)) *
        (width - padding.left - padding.right)
    );
  }

  function scaleY(value: number) {
    if (maxValue === minValue) {
      return height - padding.bottom;
    }

    return (
      height -
      padding.bottom -
      ((value - minValue) / (maxValue - minValue)) *
        (height - padding.top - padding.bottom)
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
      <rect x="0" y="0" width={width} height={height} fill="#06111d" />

      {yTicks.map((tick) => {
        const y = scaleY(tick);
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 6"
            />
            <text
              x={padding.left - 10}
              y={y + 4}
              fill="rgba(255,255,255,0.55)"
              fontSize="11"
              textAnchor="end"
            >
              {formatter(tick)}
            </text>
          </g>
        );
      })}

      {series.map((item, index) => {
        const color = pickSeriesColor(index);
        const path = buildLinePath(item.points, scaleX, scaleY);
        return (
          <g key={item.key}>
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeOpacity={index === 0 ? 1 : 0.45}
              strokeWidth={index === 0 ? 3 : 1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {xTickIndices.map((index) => {
        const point = referencePoints[index];
        if (!point) {
          return null;
        }
        const x = scaleX(point.timestamp);
        return (
          <g key={`${point.timestamp}-${index}`}>
            <line
              x1={x}
              x2={x}
              y1={padding.top}
              y2={height - padding.bottom}
              stroke="rgba(255,255,255,0.04)"
            />
            <text
              x={x}
              y={height - 12}
              fill="rgba(255,255,255,0.55)"
              fontSize="11"
              textAnchor="middle"
            >
              {formatMetricTimestamp(point.timestamp, window)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
      <p className="font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function LoadingState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-white px-5 py-8 text-sm text-slate-500">
      {copy}
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-black/10 bg-white px-5 py-8 text-sm text-slate-500">
      {copy}
    </div>
  );
}

function buildLinePath(
  points: TimeSeriesPoint[],
  scaleX: (timestamp: string) => number,
  scaleY: (value: number) => number,
) {
  return points
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command}${scaleX(point.timestamp).toFixed(2)},${scaleY(point.value).toFixed(2)}`;
    })
    .join(" ");
}

function buildYTicks(minValue: number, maxValue: number) {
  const safeMin = Number.isFinite(minValue) ? minValue : 0;
  const safeMax = Number.isFinite(maxValue) ? maxValue : 1;
  const step = (safeMax - safeMin) / 3 || safeMax || 1;

  return Array.from(
    new Set([safeMin, safeMin + step, safeMin + step * 2, safeMax]),
  );
}

function buildXTickIndices(length: number) {
  if (length <= 1) {
    return [0];
  }

  const lastIndex = length - 1;
  const middleIndex = Math.floor(lastIndex / 2);
  const quarterIndex = Math.floor(lastIndex / 4);
  const threeQuarterIndex = Math.floor((lastIndex * 3) / 4);

  return Array.from(
    new Set([0, quarterIndex, middleIndex, threeQuarterIndex, lastIndex]),
  ).sort((left, right) => left - right);
}

function pickSeriesColor(index: number) {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}
