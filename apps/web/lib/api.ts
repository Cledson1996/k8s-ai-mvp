import "server-only";
import type {
  ClusterOverview,
  Issue,
  NodeHealth
} from "@k8s-ai-mvp/shared";
import { sampleAnalysisResponse, sampleChatPrompts } from "./sample-data";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

interface OverviewResponse {
  overview: ClusterOverview;
  degradedSources: string[];
}

interface NodesResponse {
  nodes: NodeHealth[];
  degradedSources: string[];
}

interface IssuesResponse {
  issues: Issue[];
  degradedSources: string[];
}

export async function getOverviewPageData(): Promise<{
  overview: ClusterOverview;
  degradedSources: string[];
}> {
  const response = await fetchJson<OverviewResponse>("/api/overview", {
    overview: sampleAnalysisResponse.snapshot.overview,
    degradedSources: sampleAnalysisResponse.degradedSources
  });

  return {
    overview: response.overview,
    degradedSources: response.degradedSources
  };
}

export async function getNodesPageData(): Promise<{
  nodes: NodeHealth[];
  degradedSources: string[];
}> {
  const response = await fetchJson<NodesResponse>("/api/nodes", {
    nodes: sampleAnalysisResponse.snapshot.nodes,
    degradedSources: sampleAnalysisResponse.degradedSources
  });

  return {
    nodes: response.nodes,
    degradedSources: response.degradedSources
  };
}

export async function getIssuesPageData(): Promise<{
  issues: Issue[];
  degradedSources: string[];
}> {
  const response = await fetchJson<IssuesResponse>("/api/issues", {
    issues: sampleAnalysisResponse.snapshot.issues,
    degradedSources: sampleAnalysisResponse.degradedSources
  });

  return {
    issues: response.issues,
    degradedSources: response.degradedSources
  };
}

export async function getChatPageData(): Promise<{
  suggestedQuestions: string[];
  issues: Issue[];
}> {
  const response = await fetchJson<IssuesResponse>(
    "/api/issues",
    {
      issues: sampleAnalysisResponse.snapshot.issues,
      degradedSources: sampleAnalysisResponse.degradedSources
    }
  );

  return {
    suggestedQuestions: sampleChatPrompts,
    issues: response.issues
  };
}
