import type { HealthCenterResponse } from "@k8s-ai-mvp/shared";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function getHealthCenter(): Promise<HealthCenterResponse> {
  const response = await fetch(`${apiBaseUrl}/api/health-center`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as HealthCenterResponse;
}

export async function runHealthCenter(): Promise<HealthCenterResponse> {
  const response = await fetch(`${apiBaseUrl}/api/health-center/run`, {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as HealthCenterResponse;
}
