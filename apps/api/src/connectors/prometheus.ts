import type { AppConfig } from "../config.js";

export interface PrometheusMetrics {
  clusterCpuCores?: number;
  clusterMemoryBytes?: number;
  nodeCpu: Record<string, number>;
  nodeMemory: Record<string, number>;
  namespaceCpu: Record<string, number>;
  namespaceMemory: Record<string, number>;
  podCpu: Record<string, number>;
  podMemory: Record<string, number>;
}

export interface PrometheusConnector {
  collectMetrics(): Promise<PrometheusMetrics>;
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
      namespaceCpu,
      namespaceMemory,
      podCpu,
      podMemory
    ] = await Promise.all([
      this.instantScalar(`sum(rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))`),
      this.instantScalar(`sum(container_memory_working_set_bytes{container!="",image!=""})`),
      this.instantVector(`sum by (node) (rate(container_cpu_usage_seconds_total{container!="",image!=""}[5m]))`, ["node", "instance"]),
      this.instantVector(`sum by (node) (container_memory_working_set_bytes{container!="",image!=""})`, ["node", "instance"]),
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
      namespaceCpu,
      namespaceMemory,
      podCpu,
      podMemory
    };
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
}
