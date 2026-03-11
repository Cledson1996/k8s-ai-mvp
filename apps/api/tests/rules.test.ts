import type { V1Deployment } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";
import { buildRuleIssues } from "../src/services/analysis/rules.js";

describe("buildRuleIssues", () => {
  it("creates issue for high restart pod", () => {
    const issues = buildRuleIssues({
      collectedAt: "2026-03-11T10:00:00.000Z",
      pods: [
        {
          name: "api-123",
          namespace: "prod",
          phase: "Running",
          restarts: 9,
          ready: false,
          reason: "CrashLoopBackOff",
          missingResources: false
        }
      ],
      nodes: [],
      namespaces: [],
      deployments: [],
      rawPods: [],
      workloadUsage: new Map(),
      k8sGptFindings: []
    });

    expect(issues[0]?.id).toBe("pod-prod-api-123");
    expect(issues[0]?.severity).toBe("high");
  });

  it("creates issue for pressured node", () => {
    const issues = buildRuleIssues({
      collectedAt: "2026-03-11T10:00:00.000Z",
      pods: [],
      nodes: [
        {
          name: "node-a",
          status: "Ready",
          roles: ["worker"],
          taints: [],
          usage: {
            cpuPercent: 91,
            memoryPercent: 64
          },
          pressure: ["MemoryPressure"],
          podCount: 18,
          topWorkloads: []
        }
      ],
      namespaces: [],
      deployments: [],
      rawPods: [],
      workloadUsage: new Map(),
      k8sGptFindings: []
    });

    expect(issues[0]?.id).toBe("node-node-a");
  });

  it("creates issue for deployment without requests and limits", () => {
    const deployment = {
      metadata: {
        name: "payments",
        namespace: "prod"
      },
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: "api",
                resources: {
                  requests: {
                    cpu: "200m"
                  }
                }
              }
            ]
          }
        }
      }
    } as unknown as V1Deployment;

    const issues = buildRuleIssues({
      collectedAt: "2026-03-11T10:00:00.000Z",
      pods: [],
      nodes: [],
      namespaces: [],
      deployments: [deployment],
      rawPods: [],
      workloadUsage: new Map(),
      k8sGptFindings: []
    });

    expect(issues[0]?.id).toContain("missing-resources");
  });

  it("creates issue when observed usage is much higher than request", () => {
    const deployment = {
      metadata: {
        name: "search",
        namespace: "prod"
      },
      spec: {
        template: {
          spec: {
            containers: [
              {
                name: "api",
                resources: {
                  requests: {
                    cpu: "100m",
                    memory: "256Mi"
                  },
                  limits: {
                    cpu: "500m",
                    memory: "512Mi"
                  }
                }
              }
            ]
          }
        }
      }
    } as unknown as V1Deployment;

    const issues = buildRuleIssues({
      collectedAt: "2026-03-11T10:00:00.000Z",
      pods: [],
      nodes: [],
      namespaces: [],
      deployments: [deployment],
      rawPods: [],
      workloadUsage: new Map([
        [
          "prod/search",
          {
            kind: "Deployment",
            name: "search",
            namespace: "prod",
            cpuCores: 0.3
          }
        ]
      ]),
      k8sGptFindings: []
    });

    expect(issues.some((issue) => issue.id.includes("cpu-mismatch"))).toBe(true);
  });
});
