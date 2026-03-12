import type { DeploymentAnalysisResponse } from "./explorer-types";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function requestAnalysis(
  namespace: string,
  name: string,
  method: "GET" | "POST" | "DELETE",
) {
  return fetch(
    `${apiBaseUrl}/api/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/analyze`,
    {
      method,
      cache: "no-store",
    },
  );
}

export async function getSavedDeploymentAnalysis(
  namespace: string,
  name: string,
): Promise<DeploymentAnalysisResponse> {
  const response = await requestAnalysis(namespace, name, "GET");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as DeploymentAnalysisResponse;
}

export async function analyzeDeployment(
  namespace: string,
  name: string,
): Promise<DeploymentAnalysisResponse> {
  const response = await requestAnalysis(namespace, name, "POST");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as DeploymentAnalysisResponse;
}

export async function clearDeploymentAnalysis(namespace: string, name: string) {
  const response = await requestAnalysis(namespace, name, "DELETE");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
}
