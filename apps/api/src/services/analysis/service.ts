import type {
  AnalysisRunResponse,
  DeploymentsResponse,
  NamespaceDetailResponse,
  NamespacesResponse,
  ResourceDetailResponse,
  ResourceKind,
  ResourceRelationsResponse,
  SnapshotDiffResponse,
  SnapshotsResponse,
  SnapshotSummary
} from "@k8s-ai-mvp/shared";
import type { KubernetesConnector } from "../../connectors/kubernetes.js";
import type { K8sGptConnector } from "../../connectors/k8sgpt.js";
import type { PrometheusConnector } from "../../connectors/prometheus.js";
import { buildClusterSnapshot } from "../snapshot/builder.js";
import { SnapshotRepository, type StoredSnapshot } from "../snapshot/repository.js";

export interface AnalysisResult extends AnalysisRunResponse {}

export interface AnalysisService {
  getLatestOrRun(): Promise<AnalysisResult>;
  runAnalysis(): Promise<AnalysisResult>;
  listNamespaces(): Promise<NamespacesResponse>;
  getNamespace(name: string): Promise<NamespaceDetailResponse | undefined>;
  getResourceDetail(kind: ResourceKind, namespace: string | undefined, name: string): Promise<ResourceDetailResponse | undefined>;
  getResourceRelations(kind: ResourceKind, namespace: string | undefined, name: string): Promise<ResourceRelationsResponse | undefined>;
  listDeployments(): Promise<DeploymentsResponse>;
  listSnapshots(): Promise<SnapshotsResponse>;
  getSnapshotDiff(snapshotId: string, previousSnapshotId: string): Promise<SnapshotDiffResponse | undefined>;
}

export class LiveAnalysisService implements AnalysisService {
  private latestResult?: AnalysisResult;
  private latestStoredSnapshot?: StoredSnapshot;
  private inFlight?: Promise<AnalysisResult>;

  constructor(
    private readonly kubernetes: KubernetesConnector,
    private readonly prometheus: PrometheusConnector,
    private readonly k8sgpt: K8sGptConnector,
    private readonly repository: SnapshotRepository
  ) {}

  async getLatestOrRun(): Promise<AnalysisResult> {
    if (this.latestResult) {
      return this.latestResult;
    }

    const stored = this.repository.getLatest();
    if (stored) {
      this.latestStoredSnapshot = stored;
      this.latestResult = toAnalysisResult(stored);
      if (needsSnapshotRefresh(stored)) {
        this.scheduleRefresh();
      }
      return this.latestResult;
    }

    return this.runAnalysis();
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

  async listNamespaces(): Promise<NamespacesResponse> {
    const stored = await this.getStoredSnapshot();
    return {
      namespaces: stored.snapshot.namespaces,
      snapshot: toSnapshotSummary(stored.snapshot),
      degradedSources: stored.snapshot.degradedSources
    };
  }

  async getNamespace(name: string): Promise<NamespaceDetailResponse | undefined> {
    const stored = await this.getStoredSnapshot();
    const namespace = stored.snapshot.namespaces.find((item) => item.name === name);
    if (!namespace) {
      return undefined;
    }

    return {
      namespace,
      snapshot: toSnapshotSummary(stored.snapshot)
    };
  }

  async getResourceDetail(
    kind: ResourceKind,
    namespace: string | undefined,
    name: string
  ): Promise<ResourceDetailResponse | undefined> {
    const stored = await this.getStoredSnapshot();
    const key = resourceKey(kind, name, namespace);
    const resource = stored.detailsByKey[key];
    if (!resource) {
      return undefined;
    }

    return {
      resource: {
        ...resource,
        relations: stored.snapshot.relations.filter((relation) => relation.fromKey === key || relation.toKey === key),
        history: this.repository.listResourceHistory(key)
      },
      snapshot: toSnapshotSummary(stored.snapshot)
    };
  }

  async getResourceRelations(
    kind: ResourceKind,
    namespace: string | undefined,
    name: string
  ): Promise<ResourceRelationsResponse | undefined> {
    const stored = await this.getStoredSnapshot();
    const key = resourceKey(kind, name, namespace);
    const resource = stored.detailsByKey[key];
    if (!resource) {
      return undefined;
    }

    return {
      relations: stored.snapshot.relations.filter((relation) => relation.fromKey === key || relation.toKey === key),
      snapshot: toSnapshotSummary(stored.snapshot)
    };
  }

  async listDeployments(): Promise<DeploymentsResponse> {
    const stored = await this.getStoredSnapshot();
    return {
      deployments: stored.snapshot.deployments ?? [],
      snapshot: toSnapshotSummary(stored.snapshot),
      degradedSources: stored.snapshot.degradedSources
    };
  }

  async listSnapshots(): Promise<SnapshotsResponse> {
    await this.getStoredSnapshot();
    return {
      snapshots: this.repository.listSnapshots()
    };
  }

  async getSnapshotDiff(snapshotId: string, previousSnapshotId: string): Promise<SnapshotDiffResponse | undefined> {
    await this.getStoredSnapshot();
    const diff = this.repository.diffSnapshots(snapshotId, previousSnapshotId);
    return diff ? { diff } : undefined;
  }

  private async getStoredSnapshot(): Promise<StoredSnapshot> {
    if (this.latestStoredSnapshot) {
      if (needsSnapshotRefresh(this.latestStoredSnapshot)) {
        this.scheduleRefresh();
      }
      return this.latestStoredSnapshot;
    }

    const stored = this.repository.getLatest();
    if (stored) {
      this.latestStoredSnapshot = stored;
      if (needsSnapshotRefresh(stored)) {
        this.scheduleRefresh();
      }
      return stored;
    }

    await this.runAnalysis();
    if (!this.latestStoredSnapshot) {
      throw new Error("snapshot unavailable after analysis");
    }
    return this.latestStoredSnapshot;
  }

  private async collectAndAnalyze(): Promise<AnalysisResult> {
    const degradedSources: string[] = [];
    const inventoryPromise = this.kubernetes.collectInventory();
    const metricsPromise = this.prometheus.collectMetrics().catch((error: unknown) => {
      degradedSources.push(`prometheus: ${toErrorMessage(error)}`);
      return emptyMetrics();
    });
    const k8sGptPromise = this.k8sgpt.analyze().catch((error: unknown) => {
      degradedSources.push(`k8sgpt: ${toErrorMessage(error)}`);
      return [];
    });

    const inventory = await inventoryPromise;
    const [metrics, k8sGptFindings] = await Promise.all([metricsPromise, k8sGptPromise]);

    const builtSnapshot = buildClusterSnapshot({
      inventory,
      metrics,
      k8sGptFindings,
      degradedSources
    });

    const stored = this.repository.save({
      snapshot: builtSnapshot.clusterSnapshot,
      detailsByKey: builtSnapshot.detailsByKey
    });

    this.latestStoredSnapshot = stored;

    return {
      snapshot: builtSnapshot.analysisSnapshot,
      clusterSnapshot: stored.snapshot,
      degradedSources: stored.snapshot.degradedSources
    };
  }

  private scheduleRefresh() {
    if (this.inFlight) {
      return;
    }

    void this.runAnalysis().catch(() => undefined);
  }
}

function emptyMetrics() {
  return {
    nodeCpu: {},
    nodeMemory: {},
    nodeStorage: {},
    namespaceCpu: {},
    namespaceMemory: {},
    podCpu: {},
    podMemory: {}
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unexpected error";
}

function toAnalysisResult(stored: StoredSnapshot): AnalysisResult {
  return {
    snapshot: {
      overview: stored.snapshot.overview,
      nodes: stored.snapshot.nodes,
      namespaces: stored.snapshot.namespaces.map((namespace) => namespace.health),
      pods: stored.snapshot.pods,
      issues: stored.snapshot.issues
    },
    clusterSnapshot: stored.snapshot,
    degradedSources: stored.snapshot.degradedSources
  };
}

function toSnapshotSummary(snapshot: StoredSnapshot["snapshot"]): SnapshotSummary {
  return {
    id: snapshot.id,
    clusterName: snapshot.clusterName,
    collectedAt: snapshot.collectedAt,
    resourceCount: snapshot.resources.length,
    issueCount: snapshot.issues.length
  };
}

function resourceKey(kind: ResourceKind, name: string, namespace?: string): string {
  return namespace ? `${kind}:${namespace}/${name}` : `${kind}:${name}`;
}

function needsSnapshotRefresh(stored: StoredSnapshot): boolean {
  const deploymentResources =
    stored.snapshot.resources?.filter((resource) => resource.kind === "Deployment").length ?? 0;
  const deploymentInventoryCount = stored.snapshot.deployments?.length ?? 0;
  const hasNodeWorkloads = stored.snapshot.nodes.every((node) => Array.isArray(node.workloads));
  const resourceDetails = Object.values(stored.detailsByKey ?? {});
  const realResourceKinds = new Set([
    "Namespace",
    "Node",
    "Deployment",
    "ReplicaSet",
    "StatefulSet",
    "DaemonSet",
    "Pod",
    "Service",
    "EndpointSlice",
    "Ingress",
    "IngressClass",
    "HorizontalPodAutoscaler",
    "PodDisruptionBudget",
    "ServiceAccount",
    "Job",
    "CronJob",
    "PersistentVolumeClaim",
    "ConfigMap",
    "Secret"
  ]);
  const hasAnyManifestYaml = resourceDetails.some(
    (detail) => realResourceKinds.has(detail.kind) && Boolean(detail.manifestYaml)
  );

  if (deploymentResources > 0 && deploymentInventoryCount === 0) {
    return true;
  }

  if (!hasNodeWorkloads) {
    return true;
  }

  if (resourceDetails.length > 0 && !hasAnyManifestYaml) {
    return true;
  }

  return false;
}
