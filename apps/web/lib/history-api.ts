import type {
  DeploymentMetricsResponse,
  MetricWindow,
  NodeMetricsResponse,
} from "./explorer-types";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getDeploymentMetrics(
  namespace: string,
  name: string,
  window: MetricWindow,
) {
  return fetchJson<DeploymentMetricsResponse>(
    `/api/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/metrics?window=${encodeURIComponent(window)}`,
  );
}

export function getNodeMetrics(name: string, window: MetricWindow) {
  return fetchJson<NodeMetricsResponse>(
    `/api/nodes/${encodeURIComponent(name)}/metrics?window=${encodeURIComponent(window)}`,
  );
}
