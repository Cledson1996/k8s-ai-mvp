import type { NodeAnalysisResponse } from "./explorer-types";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function requestAnalysis(name: string, method: "GET" | "POST" | "DELETE") {
  return fetch(`${apiBaseUrl}/api/nodes/${encodeURIComponent(name)}/analyze`, {
    method,
    cache: "no-store",
  });
}

export async function getSavedNodeAnalysis(
  name: string,
): Promise<NodeAnalysisResponse> {
  const response = await requestAnalysis(name, "GET");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as NodeAnalysisResponse;
}

export async function analyzeNode(name: string): Promise<NodeAnalysisResponse> {
  const response = await requestAnalysis(name, "POST");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return (await response.json()) as NodeAnalysisResponse;
}

export async function clearNodeAnalysis(name: string) {
  const response = await requestAnalysis(name, "DELETE");
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
}
