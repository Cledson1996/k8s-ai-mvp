import { describe, expect, it, vi } from "vitest";
import { createApp, type AppServices } from "../src/app.js";
import type { AnalysisResult, AnalysisService } from "../src/services/analysis/service.js";

const analysisResult: AnalysisResult = {
  degradedSources: ["k8sgpt: missing command"],
  snapshot: {
    overview: {
      clusterName: "corp-cluster",
      collectedAt: "2026-03-11T10:00:00.000Z",
      nodeCount: 2,
      namespaceCount: 3,
      podCount: 10,
      unhealthyPodCount: 1,
      totalRestarts: 4,
      usage: {
        cpuCores: 1.1,
        memoryBytes: 2048
      },
      topNamespaces: [],
      topRestarts: [],
      highlightedIssues: []
    },
    nodes: [
      {
        name: "node-a",
        status: "Ready",
        roles: ["worker"],
        taints: [],
        usage: {},
        pressure: [],
        podCount: 4,
        topWorkloads: []
      }
    ],
    namespaces: [],
    pods: [],
    issues: [
      {
        id: "deployment-missing-resources-prod-payments",
        title: "Deployment prod/payments sem requests/limits completos",
        severity: "high",
        category: "configuration",
        source: "rule",
        summary: "desc",
        evidence: [],
        recommendation: "rec",
        playbook: [],
        suggestedCommands: [],
        detectedAt: "2026-03-11T10:00:00.000Z",
        resourceRef: {
          kind: "Deployment",
          name: "payments",
          namespace: "prod"
        }
      },
      {
        id: "configmap-unused-prod-legacy-config",
        title: "ConfigMap prod/legacy-config parece sem uso",
        severity: "low",
        category: "cleanup",
        source: "rule",
        summary: "cleanup",
        evidence: [],
        recommendation: "rec",
        playbook: [],
        suggestedCommands: [],
        detectedAt: "2026-03-11T10:00:00.000Z",
        resourceRef: {
          kind: "ConfigMap",
          name: "legacy-config",
          namespace: "prod"
        }
      }
    ]
  }
};

describe("api app", () => {
  function createAnalysisServiceMock(): AnalysisService {
    return {
      getLatestOrRun: vi.fn().mockResolvedValue(analysisResult),
      runAnalysis: vi.fn().mockResolvedValue(analysisResult),
      listNamespaces: vi.fn().mockResolvedValue({
        namespaces: [],
        snapshot: {
          id: "snapshot-1",
          clusterName: "corp-cluster",
          collectedAt: "2026-03-11T10:00:00.000Z",
          resourceCount: 0,
          issueCount: 1
        },
        degradedSources: []
      }),
      getNamespace: vi.fn().mockResolvedValue(undefined),
      getResourceDetail: vi.fn().mockResolvedValue(undefined),
      getResourceRelations: vi.fn().mockResolvedValue(undefined),
      listSnapshots: vi.fn().mockResolvedValue({
        snapshots: []
      }),
      getSnapshotDiff: vi.fn().mockResolvedValue(undefined)
    };
  }

  it("returns overview", async () => {
    const services: AppServices = {
      analysisService: createAnalysisServiceMock(),
      chatService: {
        answerQuestion: vi.fn().mockResolvedValue({
          answer: "test",
          citations: [],
          suggestedFollowUps: [],
          generatedAt: "2026-03-11T10:00:00.000Z"
        })
      }
    };

    const app = await createApp(services);
    const response = await app.inject({
      method: "GET",
      url: "/api/overview"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().overview.clusterName).toBe("corp-cluster");
  });

  it("filters issues by namespace", async () => {
    const services: AppServices = {
      analysisService: createAnalysisServiceMock(),
      chatService: {
        answerQuestion: vi.fn()
      }
    };

    const app = await createApp(services);
    const response = await app.inject({
      method: "GET",
      url: "/api/issues?namespace=prod"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().issues).toHaveLength(2);
  });

  it("runs analysis on demand", async () => {
    const services: AppServices = {
      analysisService: createAnalysisServiceMock(),
      chatService: {
        answerQuestion: vi.fn()
      }
    };

    const app = await createApp(services);
    const response = await app.inject({
      method: "POST",
      url: "/api/analysis/run"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().snapshot.overview.clusterName).toBe("corp-cluster");
  });

  it("filters issues by category and returns cleanup queue", async () => {
    const services: AppServices = {
      analysisService: createAnalysisServiceMock(),
      chatService: {
        answerQuestion: vi.fn()
      }
    };

    const app = await createApp(services);
    const filtered = await app.inject({
      method: "GET",
      url: "/api/issues?category=cleanup"
    });
    const cleanup = await app.inject({
      method: "GET",
      url: "/api/issues/cleanup"
    });

    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().issues).toHaveLength(1);
    expect(filtered.json().issues[0].category).toBe("cleanup");
    expect(cleanup.statusCode).toBe(200);
    expect(cleanup.json().issues).toHaveLength(1);
  });

  it("answers chat question", async () => {
    const services: AppServices = {
      analysisService: createAnalysisServiceMock(),
      chatService: {
        answerQuestion: vi.fn().mockResolvedValue({
          answer: "Os pods com mais reinicios sao prod/api-123 (9).",
          citations: [{ type: "pod", label: "prod/api-123" }],
          suggestedFollowUps: ["Quais issues estao ligados a esse pod?"],
          generatedAt: "2026-03-11T10:00:00.000Z"
        })
      }
    };

    const app = await createApp(services);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        question: "Quais pods reiniciam mais?"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().answer).toContain("prod/api-123");
  });

  it("returns namespace inventory list", async () => {
    const analysisService = createAnalysisServiceMock();
    analysisService.listNamespaces = vi.fn().mockResolvedValue({
      namespaces: [
        {
          name: "prod",
          health: {
            name: "prod",
            podCount: 12,
            unhealthyPodCount: 1,
            restartCount: 3
          },
          resourceCounts: {
            Deployment: 2
          },
          resources: [],
          topIssues: []
        }
      ],
      snapshot: {
        id: "snapshot-1",
        clusterName: "corp-cluster",
        collectedAt: "2026-03-11T10:00:00.000Z",
        resourceCount: 12,
        issueCount: 1
      },
      degradedSources: []
    });

    const app = await createApp({
      analysisService,
      chatService: {
        answerQuestion: vi.fn()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/namespaces"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().namespaces[0].name).toBe("prod");
  });
});
