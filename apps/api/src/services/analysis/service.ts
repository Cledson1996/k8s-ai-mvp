import type {
  AnalysisRunResponse,
  AnalysisSnapshot,
  ClusterOverview,
  NamespaceHealth,
  NodeHealth,
  PodHealth,
  WorkloadSummary
} from "@k8s-ai-mvp/shared";
import type { V1Node, V1Pod } from "@kubernetes/client-node";
import type { ClusterInventory, KubernetesConnector } from "../../connectors/kubernetes.js";
import type { K8sGptConnector } from "../../connectors/k8sgpt.js";
import type { PrometheusConnector, PrometheusMetrics } from "../../connectors/prometheus.js";
import { getPodOwner, getPodPrimaryReason, getPodRestartCount } from "../../lib/helpers.js";
import { parseCpu, parseMemory } from "../../lib/quantity.js";
import { buildRuleIssues, workloadKeyForPod } from "./rules.js";

export interface AnalysisResult extends AnalysisRunResponse {}

export interface AnalysisService {
  getLatestOrRun(): Promise<AnalysisResult>;
  runAnalysis(): Promise<AnalysisResult>;
}

export class LiveAnalysisService implements AnalysisService {
  private latestResult?: AnalysisResult;
  private inFlight?: Promise<AnalysisResult>;

  constructor(
    private readonly kubernetes: KubernetesConnector,
    private readonly prometheus: PrometheusConnector,
    private readonly k8sgpt: K8sGptConnector
  ) {}

  async getLatestOrRun(): Promise<AnalysisResult> {
    return this.latestResult ?? this.runAnalysis();
  }

  async runAnalysis(): Promise<AnalysisResult> {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.collectAndAnalyze().finally(() => {
      this.inFlight = undefined;
    });

    this.latestResult = await this.inFlight;
    return this.latestResult;
  }

  private async collectAndAnalyze(): Promise<AnalysisResult> {
    const inventory = await this.kubernetes.collectInventory();
    const degradedSources: string[] = [];

    const metrics = await this.prometheus.collectMetrics().catch((error: unknown) => {
      degradedSources.push(`prometheus: ${toErrorMessage(error)}`);
      return emptyMetrics();
    });

    const k8sGptFindings = await this.k8sgpt.analyze().catch((error: unknown) => {
      degradedSources.push(`k8sgpt: ${toErrorMessage(error)}`);
      return [];
    });

    const pods = inventory.pods.map((pod) => mapPodHealth(pod, metrics));
    const workloadUsage = buildWorkloadUsage(inventory.pods, metrics);
    const nodes = inventory.nodes.map((node) => mapNodeHealth(node, inventory.pods, workloadUsage, metrics));
    const namespaces = buildNamespaceHealth(inventory, pods, metrics);
    const issues = buildRuleIssues({
      collectedAt: inventory.collectedAt,
      pods,
      nodes,
      namespaces,
      deployments: inventory.deployments,
      rawPods: inventory.pods,
      workloadUsage,
      k8sGptFindings
    });

    return {
      snapshot: {
        overview: buildOverview(inventory, namespaces, pods, issues, metrics),
        nodes,
        namespaces,
        pods,
        issues
      },
      degradedSources
    };
  }
}

function mapPodHealth(pod: V1Pod, metrics: PrometheusMetrics): PodHealth {
  const namespace = pod.metadata?.namespace ?? "default";
  const name = pod.metadata?.name ?? "unknown";
  const key = `${namespace}/${name}`;
  const statuses = pod.status?.containerStatuses ?? [];

  return {
    name,
    namespace,
    phase: pod.status?.phase ?? "Unknown",
    nodeName: pod.spec?.nodeName,
    restarts: getPodRestartCount(pod),
    ready: statuses.length > 0 && statuses.every((status) => status.ready),
    reason: getPodPrimaryReason(statuses),
    cpuCores: metrics.podCpu[key],
    memoryBytes: metrics.podMemory[key],
    missingResources: (pod.spec?.containers ?? []).some((container) => {
      const requests = container.resources?.requests;
      const limits = container.resources?.limits;
      return !requests?.cpu || !requests.memory || !limits?.cpu || !limits.memory;
    })
  };
}

function mapNodeHealth(
  node: V1Node,
  pods: V1Pod[],
  workloadUsage: Map<string, WorkloadSummary>,
  metrics: PrometheusMetrics
): NodeHealth {
  const name = node.metadata?.name ?? "unknown";
  const allocatableCpu = parseCpu(node.status?.allocatable?.cpu?.toString());
  const allocatableMemory = parseMemory(node.status?.allocatable?.memory?.toString());
  const cpuUsage = metrics.nodeCpu[name];
  const memoryUsage = metrics.nodeMemory[name];
  const nodePods = pods.filter((pod) => pod.spec?.nodeName === name);

  const topWorkloads = Array.from(
    new Map(
      nodePods
        .map((pod) => workloadKeyForPod(pod))
        .filter((value): value is string => Boolean(value))
        .map((key) => [key, workloadUsage.get(key)])
        .filter((entry): entry is [string, WorkloadSummary] => Boolean(entry[1]))
    ).values()
  )
    .sort((left, right) => (right.cpuCores ?? 0) - (left.cpuCores ?? 0))
    .slice(0, 3);

  return {
    name,
    status: node.status?.conditions?.find((condition) => condition.type === "Ready")?.status === "True" ? "Ready" : "NotReady",
    roles: Object.keys(node.metadata?.labels ?? {})
      .filter((label) => label.startsWith("node-role.kubernetes.io/"))
      .map((label) => label.replace("node-role.kubernetes.io/", "")),
    taints: (node.spec?.taints ?? []).map((taint) => `${taint.key}${taint.effect ? `:${taint.effect}` : ""}`),
    usage: {
      cpuCores: cpuUsage,
      cpuPercent: allocatableCpu ? (cpuUsage / allocatableCpu) * 100 : undefined,
      memoryBytes: memoryUsage,
      memoryPercent: allocatableMemory ? (memoryUsage / allocatableMemory) * 100 : undefined
    },
    pressure: (node.status?.conditions ?? [])
      .filter((condition) => condition.status === "True" && condition.type !== "Ready")
      .map((condition) => condition.type),
    podCount: nodePods.length,
    topWorkloads
  };
}

function buildNamespaceHealth(
  inventory: ClusterInventory,
  pods: PodHealth[],
  metrics: PrometheusMetrics
): NamespaceHealth[] {
  return inventory.namespaces
    .map((namespace) => {
      const name = namespace.metadata?.name ?? "default";
      const namespacePods = pods.filter((pod) => pod.namespace === name);
      return {
        name,
        podCount: namespacePods.length,
        unhealthyPodCount: namespacePods.filter((pod) => pod.phase !== "Running" || !pod.ready).length,
        restartCount: namespacePods.reduce((total, pod) => total + pod.restarts, 0),
        cpuCores: metrics.namespaceCpu[name],
        memoryBytes: metrics.namespaceMemory[name]
      };
    })
    .sort((left, right) => (right.memoryBytes ?? 0) - (left.memoryBytes ?? 0));
}

function buildWorkloadUsage(pods: V1Pod[], metrics: PrometheusMetrics): Map<string, WorkloadSummary> {
  const map = new Map<string, WorkloadSummary>();

  for (const pod of pods) {
    const owner = getPodOwner(pod);
    const namespace = pod.metadata?.namespace ?? "default";
    const key = owner ? `${namespace}/${owner.name}` : `${namespace}/${pod.metadata?.name ?? "pod"}`;
    const podKey = `${namespace}/${pod.metadata?.name ?? "unknown"}`;
    const current = map.get(key) ?? {
      kind: owner?.kind ?? "Pod",
      name: owner?.name ?? pod.metadata?.name ?? "unknown",
      namespace,
      replicas: 0,
      readyReplicas: 0,
      cpuCores: 0,
      memoryBytes: 0
    };

    current.replicas = (current.replicas ?? 0) + 1;
    if ((pod.status?.containerStatuses ?? []).every((status) => status.ready)) {
      current.readyReplicas = (current.readyReplicas ?? 0) + 1;
    }
    current.cpuCores = (current.cpuCores ?? 0) + (metrics.podCpu[podKey] ?? 0);
    current.memoryBytes = (current.memoryBytes ?? 0) + (metrics.podMemory[podKey] ?? 0);

    map.set(key, current);
  }

  return map;
}

function buildOverview(
  inventory: ClusterInventory,
  namespaces: NamespaceHealth[],
  pods: PodHealth[],
  issues: AnalysisSnapshot["issues"],
  metrics: PrometheusMetrics
): ClusterOverview {
  return {
    clusterName: inventory.clusterName,
    collectedAt: inventory.collectedAt,
    nodeCount: inventory.nodes.length,
    namespaceCount: inventory.namespaces.length,
    podCount: inventory.pods.length,
    unhealthyPodCount: pods.filter((pod) => pod.phase !== "Running" || !pod.ready).length,
    totalRestarts: pods.reduce((total, pod) => total + pod.restarts, 0),
    usage: {
      cpuCores: metrics.clusterCpuCores,
      memoryBytes: metrics.clusterMemoryBytes
    },
    topNamespaces: namespaces.slice(0, 5),
    topRestarts: [...pods].sort((left, right) => right.restarts - left.restarts).slice(0, 5),
    highlightedIssues: issues.slice(0, 5)
  };
}

function emptyMetrics(): PrometheusMetrics {
  return {
    nodeCpu: {},
    nodeMemory: {},
    namespaceCpu: {},
    namespaceMemory: {},
    podCpu: {},
    podMemory: {}
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected error";
}
