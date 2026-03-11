import type {
  MetricWindow,
  ResourceHistorySeries,
  TimeSeriesPoint,
  UsageHistorySummary,
} from "@k8s-ai-mvp/shared";
import type { AppConfig } from "../config.js";

export interface PrometheusMetrics {
  clusterCpuCores?: number;
  clusterMemoryBytes?: number;
  nodeCpu: Record<string, number>;
  nodeMemory: Record<string, number>;
  nodeStorage: Record<string, number>;
  namespaceCpu: Record<string, number>;
  namespaceMemory: Record<string, number>;
  podCpu: Record<string, number>;
  podMemory: Record<string, number>;
}

export interface PrometheusConnector {
  collectMetrics(): Promise<PrometheusMetrics>;
  rangeVector(
    query: string,
    labels: string[],
    window: MetricWindow
  ): Promise<Record<string, TimeSeriesPoint[]>>;
}

interface PrometheusQueryResult {
  status: string;
  data?: {
    result?: Array<{
      metric?: Record<string, string>;
      value?: [number, string];
    }>;
  };
}

interface PrometheusRangeQueryResult {
  status: string;
  data?: {
    result?: Array<{
      metric?: Record<string, string>;
      values?: Array<[number, string]>;
    }>;
  };
}

export class LivePrometheusConnector implements PrometheusConnector {
  constructor(private readonly config: AppConfig) {}

  async collectMetrics(): Promise<PrometheusMetrics> {
    if (!this.config.PROMETHEUS_BASE_URL) {
      throw new Error("PROMETHEUS_BASE_URL is not configured");
    }

    const [
      clusterCpu,
      clusterMemory,
      nodeCpu,
      nodeMemory,
      nodeStorage,
      namespaceCpu,
      namespaceMemory,
      podCpu,
      podMemory
    ] = await Promise.all([
      this.instantScalar(`sum(rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))`),
      this.instantScalar(`sum(container_memory_working_set_bytes{container!="",image!=""})`),
      this.instantVector(`sum by (node) (rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))`, ["node", "instance"]),
      this.instantVector(`sum by (node) (container_memory_working_set_bytes{container!="",image!=""})`, ["node", "instance"]),
      this.instantVector(`sum by (node) (container_fs_usage_bytes{container!="",image!=""})`, ["node", "instance"]),
      this.instantVector(`sum by (namespace) (rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))`, ["namespace"]),
      this.instantVector(`sum by (namespace) (container_memory_working_set_bytes{container!="",image!=""})`, ["namespace"]),
      this.instantVector(`sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))`, ["namespace", "pod"]),
      this.instantVector(`sum by (namespace, pod) (container_memory_working_set_bytes{container!="",image!=""})`, ["namespace", "pod"])
    ]);

    return {
      clusterCpuCores: clusterCpu,
      clusterMemoryBytes: clusterMemory,
      nodeCpu,
      nodeMemory,
      nodeStorage,
      namespaceCpu,
      namespaceMemory,
      podCpu,
      podMemory
    };
  }

  async rangeVector(
    query: string,
    labels: string[],
    window: MetricWindow
  ): Promise<Record<string, TimeSeriesPoint[]>> {
    const response = await this.queryRange(query, window);
    const output: Record<string, TimeSeriesPoint[]> = {};

    for (const item of response.data?.result ?? []) {
      const key = labels
        .map((label) => item.metric?.[label])
        .filter(Boolean)
        .join("/");
      if (!key) {
        continue;
      }

      output[key] = (item.values ?? []).map(([timestamp, value]) => ({
        timestamp: new Date(timestamp * 1000).toISOString(),
        value: Number(value ?? 0),
      }));
    }

    return output;
  }

  private async instantScalar(query: string): Promise<number | undefined> {
    const response = await this.query(query);
    const value = response.data?.result?.[0]?.value?.[1];
    return value ? Number(value) : undefined;
  }

  private async instantVector(query: string, labels: string[]): Promise<Record<string, number>> {
    const response = await this.query(query);
    const output: Record<string, number> = {};

    for (const item of response.data?.result ?? []) {
      const key = labels.map((label) => item.metric?.[label]).filter(Boolean).join("/");
      if (!key) {
        continue;
      }

      output[key] = Number(item.value?.[1] ?? 0);
    }

    return output;
  }

  private async query(query: string): Promise<PrometheusQueryResult> {
    const url = new URL("/api/v1/query", this.config.PROMETHEUS_BASE_URL);
    url.searchParams.set("query", query);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Prometheus query failed with status ${response.status}`);
    }

    return (await response.json()) as PrometheusQueryResult;
  }

  private async queryRange(
    query: string,
    window: MetricWindow
  ): Promise<PrometheusRangeQueryResult> {
    const url = new URL("/api/v1/query_range", this.config.PROMETHEUS_BASE_URL);
    const end = Math.floor(Date.now() / 1000);
    const start = end - windowToSeconds(window);
    url.searchParams.set("query", query);
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    url.searchParams.set("step", String(windowToStepSeconds(window)));

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Prometheus range query failed with status ${response.status}`);
    }

    return (await response.json()) as PrometheusRangeQueryResult;
  }
}

function windowToSeconds(window: MetricWindow) {
  switch (window) {
    case "1h":
      return 60 * 60;
    case "6h":
      return 6 * 60 * 60;
    case "24h":
      return 24 * 60 * 60;
    case "7d":
    default:
      return 7 * 24 * 60 * 60;
  }
}

function windowToStepSeconds(window: MetricWindow) {
  switch (window) {
    case "1h":
      return 60;
    case "6h":
      return 5 * 60;
    case "24h":
      return 15 * 60;
    case "7d":
    default:
      return 60 * 60;
  }
}

export function summarizeSeries(
  window: MetricWindow,
  cpuPoints: TimeSeriesPoint[],
  memoryPoints: TimeSeriesPoint[]
): UsageHistorySummary {
  return {
    window,
    cpu: {
      avg: averageOf(cpuPoints),
      max: maxOf(cpuPoints),
    },
    memory: {
      avg: averageOf(memoryPoints),
      max: maxOf(memoryPoints),
    },
  };
}

export function buildHistorySeries(
  key: string,
  label: string,
  points: TimeSeriesPoint[]
): ResourceHistorySeries {
  return {
    key,
    label,
    points,
  };
}

export function sumSeriesByKeys(
  keys: string[],
  seriesMap: Record<string, TimeSeriesPoint[]>
): TimeSeriesPoint[] {
  const accumulator = new Map<string, number>();

  for (const key of keys) {
    for (const point of seriesMap[key] ?? []) {
      accumulator.set(point.timestamp, (accumulator.get(point.timestamp) ?? 0) + point.value);
    }
  }

  return Array.from(accumulator.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([timestamp, value]) => ({ timestamp, value }));
}

function averageOf(points: TimeSeriesPoint[]) {
  if (points.length === 0) {
    return undefined;
  }

  return points.reduce((total, point) => total + point.value, 0) / points.length;
}

function maxOf(points: TimeSeriesPoint[]) {
  if (points.length === 0) {
    return undefined;
  }

  return points.reduce((max, point) => Math.max(max, point.value), points[0]?.value ?? 0);
}
