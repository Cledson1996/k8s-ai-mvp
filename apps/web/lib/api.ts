import "server-only";
import type {
  ClusterOverview,
  DeploymentsResponse as BackendDeploymentsResponse,
  DeploymentInventory as BackendDeploymentInventory,
  Issue,
  NamespaceDetailResponse as BackendNamespaceDetailResponse,
  NamespaceInventory as BackendNamespaceInventory,
  NamespacesResponse as BackendNamespacesResponse,
  NodeHealth,
  ResourceDetail as BackendResourceDetail,
  ResourceDetailResponse as BackendResourceDetailResponse,
  ResourceKind as BackendResourceKind,
  ResourceRelation as BackendResourceRelation,
  ResourceRelationsResponse as BackendResourceRelationsResponse,
  SnapshotDiff as BackendSnapshotDiff,
  SnapshotDiffResponse as BackendSnapshotDiffResponse,
  SnapshotsResponse as BackendSnapshotsResponse,
  SnapshotSummary as BackendSnapshotSummary
} from "@k8s-ai-mvp/shared";
import type {
  ClusterSnapshot,
  DeploymentInventory,
  NamespaceInventory,
  ResourceAutoscaling,
  ResourceDetail,
  ResourceEvent,
  ResourceExposure,
  ResourceHealth,
  ResourceKind,
  ResourceRelation,
  ResourceResilience,
  ResourceRollout,
  ResourceScheduling,
  SnapshotDiff
} from "./explorer-types";
import {
  getSampleNamespace,
  sampleDeploymentInventories,
  getSampleResourceDetail,
  getSampleSnapshotDiff,
  sampleAnalysisResponse,
  sampleChatPrompts,
  sampleNamespaces,
  sampleSnapshots
} from "./sample-data";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

export async function getDeploymentsPageData(): Promise<{
  deployments: DeploymentInventory[];
  degradedSources: string[];
}> {
  const response = await fetchJson<BackendDeploymentsResponse>("/api/deployments", {
    deployments: [],
    snapshot: {
      id: "fallback",
      clusterName: sampleAnalysisResponse.snapshot.overview.clusterName,
      collectedAt: sampleAnalysisResponse.snapshot.overview.collectedAt,
      resourceCount: 0,
      issueCount: 0
    },
    degradedSources: sampleAnalysisResponse.degradedSources
  });

  return {
    deployments:
      response.deployments.length > 0
        ? response.deployments.map(toDeploymentInventory)
        : sampleDeploymentInventories,
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
  const response = await fetchJson<IssuesResponse>("/api/issues", {
    issues: sampleAnalysisResponse.snapshot.issues,
    degradedSources: sampleAnalysisResponse.degradedSources
  });

  return {
    suggestedQuestions: sampleChatPrompts,
    issues: response.issues
  };
}

export async function getExplorerLandingData(): Promise<{
  namespaces: NamespaceInventory[];
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}> {
  const [namespacesResponse, snapshotsResponse] = await Promise.all([
    fetchJson<BackendNamespacesResponse>("/api/namespaces", {
      namespaces: [],
      snapshot: {
        id: "fallback",
        clusterName: sampleAnalysisResponse.snapshot.overview.clusterName,
        collectedAt: sampleAnalysisResponse.snapshot.overview.collectedAt,
        resourceCount: 0,
        issueCount: 0
      },
      degradedSources: sampleAnalysisResponse.degradedSources
    }),
    fetchJson<BackendSnapshotsResponse>("/api/snapshots", {
      snapshots: []
    })
  ]);

  const namespaces =
    namespacesResponse.namespaces.length > 0
      ? namespacesResponse.namespaces.map(toNamespaceInventory)
      : sampleNamespaces;
  const snapshots =
    snapshotsResponse.snapshots.length > 0
      ? toClusterSnapshots(snapshotsResponse.snapshots)
      : sampleSnapshots;

  return {
    namespaces,
    snapshots,
    degradedSources: Array.from(new Set(namespacesResponse.degradedSources))
  };
}

export async function getNamespacePageData(name: string): Promise<{
  namespace: NamespaceInventory;
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}> {
  const [namespaceResponse, snapshotsResponse] = await Promise.all([
    fetchJson<BackendNamespaceDetailResponse>(`/api/namespaces/${encodeURIComponent(name)}`, {
      namespace: undefined as never,
      snapshot: {
        id: "fallback",
        clusterName: sampleAnalysisResponse.snapshot.overview.clusterName,
        collectedAt: sampleAnalysisResponse.snapshot.overview.collectedAt,
        resourceCount: 0,
        issueCount: 0
      }
    }),
    fetchJson<BackendSnapshotsResponse>("/api/snapshots", {
      snapshots: []
    })
  ]);

  return {
    namespace: namespaceResponse.namespace
      ? toNamespaceInventory(namespaceResponse.namespace)
      : getSampleNamespace(name),
    snapshots:
      snapshotsResponse.snapshots.length > 0
        ? toClusterSnapshots(snapshotsResponse.snapshots)
        : sampleSnapshots,
    degradedSources: []
  };
}

export async function getResourceDetailPageData(
  kind: string,
  namespace: string,
  name: string
): Promise<{
  detail: ResourceDetail;
  degradedSources: string[];
}> {
  const encodedKind = encodeURIComponent(kind);
  const encodedNamespace = encodeURIComponent(namespace);
  const encodedName = encodeURIComponent(name);

  const [resourceResponse, relationsResponse] = await Promise.all([
    fetchJson<BackendResourceDetailResponse>(
      `/api/resources/${encodedKind}/${encodedNamespace}/${encodedName}`,
      {
        resource: undefined as never,
        snapshot: {
          id: "fallback",
          clusterName: sampleAnalysisResponse.snapshot.overview.clusterName,
          collectedAt: sampleAnalysisResponse.snapshot.overview.collectedAt,
          resourceCount: 0,
          issueCount: 0
        }
      }
    ),
    fetchJson<BackendResourceRelationsResponse>(
      `/api/resources/${encodedKind}/${encodedNamespace}/${encodedName}/relations`,
      {
        relations: [],
        snapshot: {
          id: "fallback",
          clusterName: sampleAnalysisResponse.snapshot.overview.clusterName,
          collectedAt: sampleAnalysisResponse.snapshot.overview.collectedAt,
          resourceCount: 0,
          issueCount: 0
        }
      }
    )
  ]);

  if (!resourceResponse.resource) {
    return {
      detail: getSampleResourceDetail(kind, namespace, name),
      degradedSources: sampleAnalysisResponse.degradedSources
    };
  }

  const detail = toResourceDetail(resourceResponse.resource, resourceResponse.snapshot.collectedAt);
  const relations = relationsResponse.relations.map((relation) =>
    toResourceRelation(relation, detail.resource.kind, detail.resource.namespace, detail.resource.name)
  );

  return {
    detail: {
      ...detail,
      relations: relations.length > 0 ? relations : detail.relations
    },
    degradedSources: []
  };
}

export async function getHistoryPageData(): Promise<{
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}> {
  const response = await fetchJson<BackendSnapshotsResponse>("/api/snapshots", {
    snapshots: []
  });

  return {
    snapshots: response.snapshots.length > 0 ? toClusterSnapshots(response.snapshots) : sampleSnapshots,
    degradedSources: []
  };
}

export async function getSnapshotDiffPageData(
  snapshotId: string,
  previousId: string
): Promise<{
  diff: SnapshotDiff;
  snapshots: ClusterSnapshot[];
  degradedSources: string[];
}> {
  const [diffResponse, snapshotsResponse] = await Promise.all([
    fetchJson<BackendSnapshotDiffResponse>(
      `/api/snapshots/${encodeURIComponent(snapshotId)}/diff/${encodeURIComponent(previousId)}`,
      {
        diff: undefined as never
      }
    ),
    fetchJson<BackendSnapshotsResponse>("/api/snapshots", {
      snapshots: []
    })
  ]);

  return {
    diff: diffResponse.diff ? toSnapshotDiff(diffResponse.diff) : getSampleSnapshotDiff(snapshotId, previousId),
    snapshots: snapshotsResponse.snapshots.length > 0 ? toClusterSnapshots(snapshotsResponse.snapshots) : sampleSnapshots,
    degradedSources: []
  };
}

function toNamespaceInventory(namespace: BackendNamespaceInventory): NamespaceInventory {
  const resources = namespace.resources.map(toResourceSummary);
  const resourceCount = resources.length;
  const unhealthyResourceCount = resources.filter((resource) => resource.health !== "healthy").length;

  return {
    name: namespace.name,
    status: namespace.health.unhealthyPodCount > 0 || namespace.topIssues.length > 0 ? "warning" : "healthy",
    summary: `${namespace.health.podCount} pods, ${resourceCount} recursos e ${namespace.topIssues.length} issues contextualizadas.`,
    podCount: namespace.health.podCount,
    resourceCount,
    unhealthyResourceCount,
    issueCount: namespace.topIssues.length,
    cpuCores: namespace.health.cpuCores,
    memoryBytes: namespace.health.memoryBytes,
    kinds: Object.entries(namespace.resourceCounts)
      .map(([kind, count]) => ({ kind: kind as ResourceKind, count: count ?? 0 }))
      .sort((left, right) => left.kind.localeCompare(right.kind)),
    resources,
    issues: namespace.topIssues
  };
}

function toResourceSummary(resource: BackendNamespaceInventory["resources"][number]) {
  const health = toResourceHealth(resource.status, resource.issueCount);
  const scope: "application" | "platform" =
    resource.namespace && isPlatformNamespace(resource.namespace) ? "platform" : "application";

  return {
    kind: resource.kind as ResourceKind,
    name: resource.name,
    namespace: resource.namespace ?? "_cluster",
    status: resource.status,
    health,
    summary: buildResourceSummary(resource),
    ready: resource.replicas?.ready,
    desired: resource.replicas?.desired,
    issueCount: resource.issueCount,
    cpuCores: resource.usage?.cpuCores,
    memoryBytes: resource.usage?.memoryBytes,
    labels: resource.labels,
    scope
  };
}

function toResourceDetail(resource: BackendResourceDetail, collectedAt: string): ResourceDetail {
  const summary = toResourceSummary(resource);
  const relations = resource.relations.map((relation) =>
    toResourceRelation(relation, summary.kind, summary.namespace, summary.name)
  );
  const issues = resource.issues ?? [];
  const rollout = buildRollout(resource, summary, issues);
  const events = toFrontendEvents(resource.events) ?? rollout?.events;

  return {
    resource: {
      ...summary,
      createdAt: collectedAt,
      nodeName: findNodeName(resource)
    },
    metrics: {
      cpuCores: resource.metrics?.cpuCores,
      memoryBytes: resource.metrics?.memoryBytes,
      restartCount: findRestartCount(resource)
    },
    issues,
    suggestedCommands: resource.suggestedCommands ?? [],
    relations,
    history: (resource.history ?? []).map((entry) => ({
      id: `${entry.snapshotId}-${entry.resourceKey}-${entry.changeType}`,
      timestamp: entry.collectedAt,
      changeType: toFrontendChangeType(entry.changeType),
      title: entry.summary,
      detail: entry.summary
    })),
    rollout,
    autoscaling: buildAutoscaling(resource, summary, relations, issues),
    exposure: buildExposure(resource, summary, relations),
    scheduling: buildScheduling(resource, relations),
    resilience: buildResilience(resource, summary, relations, issues),
    cleanupSignals: buildCleanupSignals(resource, issues),
    events,
    insights: resource.insights ?? [],
    references: (resource.references ?? []).map((reference) => ({
      kind: reference.kind,
      name: reference.name,
      namespace: reference.namespace ?? summary.namespace
    }))
  };
}

function toResourceRelation(
  relation: BackendResourceRelation,
  currentKind: ResourceKind,
  currentNamespace: string,
  currentName: string
): ResourceRelation {
  const currentKey = buildBackendResourceKey(currentKind, currentName, currentNamespace);
  const outgoing = relation.fromKey === currentKey;
  const target = parseBackendResourceKey(outgoing ? relation.toKey : relation.fromKey);

  return {
    type: relation.type,
    direction: outgoing ? "outgoing" : "incoming",
    target: {
      kind: target.kind,
      namespace: target.namespace,
      name: target.name
    },
    title: `${relation.label}`,
    detail: outgoing
      ? `${currentKind} ${currentName} se conecta a ${target.kind} ${target.name}.`
      : `${target.kind} ${target.name} se conecta a ${currentKind} ${currentName}.`
  };
}

function toClusterSnapshots(snapshots: BackendSnapshotSummary[]): ClusterSnapshot[] {
  return snapshots.map((snapshot, index) => ({
    id: snapshot.id,
    clusterName: snapshot.clusterName,
    collectedAt: snapshot.collectedAt,
    namespaceCount: 0,
    resourceCount: snapshot.resourceCount,
    issueCount: snapshot.issueCount,
    changeCount: index === snapshots.length - 1 ? 0 : 1
  }));
}

function toSnapshotDiff(diff: BackendSnapshotDiff): SnapshotDiff {
  const changes = [
    ...diff.added.map((entry) => toSnapshotDiffChange("added", entry)),
    ...diff.removed.map((entry) => toSnapshotDiffChange("removed", entry)),
    ...diff.changed.map((entry) => toSnapshotDiffChange("changed", entry))
  ];

  return {
    currentSnapshotId: diff.snapshotId,
    previousSnapshotId: diff.previousSnapshotId,
    generatedAt: diff.collectedAt,
    summary: {
      added: diff.added.length,
      removed: diff.removed.length,
      changed: diff.changed.length
    },
    changes
  };
}

function toDeploymentInventory(deployment: BackendDeploymentInventory): DeploymentInventory {
  return {
    key: deployment.key,
    name: deployment.name,
    namespace: deployment.namespace,
    status: deployment.status,
    health: deployment.health,
    desiredReplicas: deployment.desiredReplicas,
    readyReplicas: deployment.readyReplicas,
    updatedReplicas: deployment.updatedReplicas,
    availableReplicas: deployment.availableReplicas,
    rolloutDegraded: deployment.rolloutDegraded,
    autoscaling: deployment.autoscaling
      ? {
          ...deployment.autoscaling,
          atMaxReplicas: deployment.autoscaling.atMaxReplicas ?? false,
          conditions: deployment.autoscaling.conditions ?? []
        }
      : undefined,
    exposure: deployment.exposure
      ? {
          services: deployment.exposure.services.map((service) => ({
            ...service,
            namespace: service.namespace ?? deployment.namespace,
            ports: service.ports ?? [],
            endpointSlices: service.endpointSlices.map((slice) => ({
              ...slice,
              backingPods: slice.backingPods ?? []
            }))
          })),
          ingresses: deployment.exposure.ingresses.map((ingress) => ({
            ...ingress,
            namespace: ingress.namespace ?? deployment.namespace,
            hosts: ingress.hosts ?? [],
            tlsSecrets: ingress.tlsSecrets ?? [],
            backendServices: ingress.backendServices ?? []
          }))
        }
      : undefined,
    resilience: deployment.resilience
      ? {
          ...deployment.resilience,
          podDisruptionBudgets: deployment.resilience.podDisruptionBudgets ?? [],
          risks: deployment.resilience.risks ?? []
        }
      : undefined,
    references: deployment.references ?? [],
    cleanupSignals: deployment.cleanupSignals ?? [],
    topIssues: deployment.topIssues ?? [],
    suggestedCommands: deployment.suggestedCommands ?? []
  };
}

function toSnapshotDiffChange(
  changeType: "added" | "removed" | "changed",
  entry: BackendSnapshotDiff["added"][number]
) {
  return {
    changeType,
    resource: {
      kind: entry.kind as ResourceKind,
      namespace: entry.namespace ?? "_cluster",
      name: entry.name
    },
    detail: entry.summary
  };
}

function toResourceHealth(status: string, issueCount: number): ResourceHealth {
  const normalized = status.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("degraded") || normalized.includes("notready")) {
    return "critical";
  }
  if (issueCount > 0 || normalized.includes("pending") || normalized.includes("unknown")) {
    return "warning";
  }
  return "healthy";
}

function buildResourceSummary(resource: BackendNamespaceInventory["resources"][number]): string {
  const parts = [resource.status];
  if (resource.replicas?.ready !== undefined && resource.replicas?.desired !== undefined) {
    parts.push(`ready ${resource.replicas.ready}/${resource.replicas.desired}`);
  }
  if (resource.usage?.cpuCores !== undefined) {
    parts.push(`cpu ${resource.usage.cpuCores.toFixed(2)}`);
  }
  if (resource.issueCount > 0) {
    parts.push(`${resource.issueCount} issues`);
  }
  return parts.join(" | ");
}

function buildRollout(
  resource: BackendResourceDetail,
  summary: ReturnType<typeof toResourceSummary>,
  issues: Issue[]
): ResourceRollout | undefined {
  const rolloutIssues = issues.filter((issue) =>
    issue.category === "rollout" || issue.category === "availability"
  );
  const events = toFrontendEvents(resource.rollout?.events) ?? toIssueEvents(rolloutIssues);
  const conditions =
    resource.rollout?.conditions?.map((condition) => ({
      type: condition.type,
      status: condition.status,
      reason: condition.reason,
      message: condition.message
    })) ??
    rolloutIssues.map((issue) => ({
      type: issue.category,
      status: issue.severity,
      reason: issue.source,
      message: issue.summary
    }));

  const derived: ResourceRollout = {
    desiredReplicas: resource.rollout?.desiredReplicas ?? summary.desired,
    readyReplicas: resource.rollout?.readyReplicas ?? summary.ready,
    updatedReplicas: resource.rollout?.updatedReplicas ?? summary.ready,
    availableReplicas: resource.rollout?.availableReplicas ?? summary.ready,
    unavailableReplicas:
      resource.rollout?.unavailableReplicas ??
      deriveUnavailableReplicas(summary.desired, summary.ready),
    paused: resource.rollout?.paused ?? false,
    progressing: resource.rollout?.progressing,
    currentRevision: resource.rollout?.currentRevision,
    updatedRevision: resource.rollout?.updatedRevision,
    conditions,
    events
  };

  if (!isWorkloadKind(summary.kind) && conditions.length === 0 && events.length === 0) {
    return undefined;
  }

  if (
    derived.desiredReplicas === undefined &&
    derived.readyReplicas === undefined &&
    derived.updatedReplicas === undefined &&
    derived.availableReplicas === undefined &&
    conditions.length === 0 &&
    events.length === 0
  ) {
    return undefined;
  }

  return derived;
}

function buildAutoscaling(
  resource: BackendResourceDetail,
  summary: ReturnType<typeof toResourceSummary>,
  relations: ResourceRelation[],
  issues: Issue[]
): ResourceAutoscaling | undefined {
  const autoscalingIssues = issues.filter((issue) => issue.category === "autoscaling");
  const hpaRelation = relations.find(
    (relation) => relation.target.kind === "HorizontalPodAutoscaler"
  );

  if (resource.autoscaling) {
    return {
      enabled: resource.autoscaling.enabled,
      sourceKind: resource.autoscaling.sourceKind,
      name: resource.autoscaling.name,
      namespace: resource.autoscaling.namespace ?? summary.namespace,
      minReplicas: resource.autoscaling.minReplicas,
      maxReplicas: resource.autoscaling.maxReplicas,
      currentReplicas: resource.autoscaling.currentReplicas ?? summary.ready,
      desiredReplicas: resource.autoscaling.desiredReplicas ?? summary.desired,
      targetKind: resource.autoscaling.targetKind,
      targetName: resource.autoscaling.targetName,
      cpuTargetUtilization: resource.autoscaling.cpuTargetUtilization,
      currentCpuUtilization: resource.autoscaling.currentCpuUtilization,
      memoryTargetUtilization: resource.autoscaling.memoryTargetUtilization,
      currentMemoryUtilization: resource.autoscaling.currentMemoryUtilization,
      atMaxReplicas: resource.autoscaling.atMaxReplicas ?? false,
      conditions:
        resource.autoscaling.conditions?.map((condition) => ({
          type: condition.type,
          status: condition.status,
          reason: condition.reason,
          message: condition.message
        })) ?? []
    };
  }

  if (!isWorkloadKind(summary.kind) && !hpaRelation && autoscalingIssues.length === 0) {
    return undefined;
  }

  return {
    enabled: Boolean(hpaRelation),
    sourceKind: hpaRelation ? "HorizontalPodAutoscaler" : undefined,
    name: hpaRelation?.target.name,
    namespace: hpaRelation?.target.namespace,
    currentReplicas: summary.ready,
    desiredReplicas: summary.desired,
    targetKind: summary.kind,
    targetName: summary.name,
    atMaxReplicas: false,
    conditions: autoscalingIssues.map((issue) => ({
      type: issue.category,
      status: issue.severity,
      reason: issue.source,
      message: issue.summary
    }))
  };
}

function buildExposure(
  resource: BackendResourceDetail,
  summary: ReturnType<typeof toResourceSummary>,
  relations: ResourceRelation[]
): ResourceExposure | undefined {
  if (resource.exposure) {
    return {
      services: (resource.exposure.services ?? []).map((service) => ({
        name: service.name,
        namespace: service.namespace ?? summary.namespace,
        type: service.type,
        ports: service.ports ?? [],
        selector: service.selector,
        readyEndpoints: service.readyEndpoints,
        totalEndpoints: service.totalEndpoints,
        endpointSlices: (service.endpointSlices ?? []).map((slice) => ({
          name: slice.name,
          readyEndpoints: slice.readyEndpoints,
          totalEndpoints: slice.totalEndpoints,
          backingPods: slice.backingPods ?? []
        }))
      })),
      ingresses: (resource.exposure.ingresses ?? []).map((ingress) => ({
        name: ingress.name,
        namespace: ingress.namespace ?? summary.namespace,
        ingressClassName: ingress.ingressClassName,
        hosts: ingress.hosts ?? [],
        tlsSecrets: ingress.tlsSecrets ?? [],
        backendServices: ingress.backendServices ?? [],
        defaultBackendService: ingress.defaultBackendService
      }))
    };
  }

  const serviceRelations = relations.filter((relation) => relation.target.kind === "Service");
  const ingressRelations = relations.filter((relation) => relation.target.kind === "Ingress");
  const endpointRelations = relations.filter(
    (relation) => relation.target.kind === "EndpointSlice"
  );

  const services = serviceRelations.map((relation, index) => ({
    name: relation.target.name,
    namespace: relation.target.namespace,
    ports: [],
    endpointSlices:
      index === 0
        ? endpointRelations.map((endpoint) => ({
            name: endpoint.target.name,
            readyEndpoints: 0,
            totalEndpoints: 0
          }))
        : []
  }));

  const ingresses = ingressRelations.map((relation) => ({
    name: relation.target.name,
    namespace: relation.target.namespace,
    hosts: [],
    tlsSecrets: [],
    backendServices: services.map((service) => service.name)
  }));

  if (summary.kind === "Service" && services.length === 0) {
    services.push({
      name: summary.name,
      namespace: summary.namespace,
      ports: [],
      endpointSlices: endpointRelations.map((endpoint) => ({
        name: endpoint.target.name,
        readyEndpoints: 0,
        totalEndpoints: 0
      }))
    });
  }

  if (summary.kind === "Ingress" && ingresses.length === 0) {
    ingresses.push({
      name: summary.name,
      namespace: summary.namespace,
      hosts: [],
      tlsSecrets: [],
      backendServices: services.map((service) => service.name)
    });
  }

  if (services.length === 0 && ingresses.length === 0) {
    return undefined;
  }

  return { services, ingresses };
}

function buildScheduling(
  resource: BackendResourceDetail,
  relations: ResourceRelation[]
): ResourceScheduling | undefined {
  if (resource.scheduling) {
    return {
      serviceAccountName: resource.scheduling.serviceAccountName,
      imagePullSecrets: resource.scheduling.imagePullSecrets ?? [],
      nodeSelector: resource.scheduling.nodeSelector ?? [],
      tolerations: resource.scheduling.tolerations ?? [],
      affinitySummary: resource.scheduling.affinitySummary ?? [],
      topologySpread: resource.scheduling.topologySpread ?? []
    };
  }

  const serviceAccount = relations.find((relation) => relation.target.kind === "ServiceAccount");
  if (!serviceAccount) {
    return undefined;
  }

  return {
    serviceAccountName: serviceAccount.target.name,
    imagePullSecrets: [],
    nodeSelector: [],
    tolerations: [],
    affinitySummary: [],
    topologySpread: []
  };
}

function buildResilience(
  resource: BackendResourceDetail,
  summary: ReturnType<typeof toResourceSummary>,
  relations: ResourceRelation[],
  issues: Issue[]
): ResourceResilience | undefined {
  if (resource.resilience) {
    return {
      hasReadinessProbe: resource.resilience.hasReadinessProbe,
      hasLivenessProbe: resource.resilience.hasLivenessProbe,
      hasStartupProbe: resource.resilience.hasStartupProbe,
      podDisruptionBudgets: (resource.resilience.podDisruptionBudgets ?? []).map((pdb) => ({
        name: pdb.name,
        namespace: pdb.namespace ?? summary.namespace,
        minAvailable: pdb.minAvailable,
        maxUnavailable: pdb.maxUnavailable,
        disruptionsAllowed: pdb.disruptionsAllowed
      })),
      hasPodDisruptionBudget: resource.resilience.hasPodDisruptionBudget,
      hasAntiAffinity: resource.resilience.hasAntiAffinity,
      risks: resource.resilience.risks ?? []
    };
  }

  const resilienceIssues = issues.filter(
    (issue) => issue.category === "availability" || issue.category === "reliability"
  );
  const pdbRelations = relations.filter(
    (relation) => relation.target.kind === "PodDisruptionBudget"
  );

  if (!isWorkloadKind(summary.kind) && pdbRelations.length === 0 && resilienceIssues.length === 0) {
    return undefined;
  }

  return {
    hasReadinessProbe: false,
    hasLivenessProbe: false,
    hasStartupProbe: false,
    podDisruptionBudgets: pdbRelations.map((relation) => ({
      name: relation.target.name,
      namespace: relation.target.namespace
    })),
    hasPodDisruptionBudget: pdbRelations.length > 0,
    hasAntiAffinity: false,
    risks: resilienceIssues.map((issue) => issue.summary)
  };
}

function buildCleanupSignals(resource: BackendResourceDetail, issues: Issue[]): string[] | undefined {
  const explicit = resource.cleanupSignals?.filter(Boolean) ?? [];
  const derived = issues
    .filter((issue) => issue.category === "cleanup")
    .map((issue) => issue.summary);
  const cleanupSignals = Array.from(new Set([...explicit, ...derived]));

  return cleanupSignals.length > 0 ? cleanupSignals : undefined;
}

function toFrontendEvents(
  events:
    | BackendResourceDetail["events"]
    | NonNullable<BackendResourceDetail["rollout"]>["events"]
    | undefined
): ResourceEvent[] | undefined {
  if (!events || events.length === 0) {
    return undefined;
  }

  return events.map((event) => ({
    type: event.type,
    reason: event.reason,
    message: event.message,
    count: event.count,
    lastSeen: event.lastSeen
  }));
}

function toIssueEvents(issues: Issue[]): ResourceEvent[] {
  return issues.map((issue) => ({
    type: issue.category,
    reason: issue.title,
    message: issue.summary,
    lastSeen: issue.detectedAt
  }));
}

function deriveUnavailableReplicas(desired?: number, ready?: number) {
  if (desired === undefined || ready === undefined) {
    return undefined;
  }

  return Math.max(desired - ready, 0);
}

function isWorkloadKind(kind: ResourceKind) {
  return (
    kind === "Deployment" ||
    kind === "ReplicaSet" ||
    kind === "StatefulSet" ||
    kind === "DaemonSet"
  );
}

function findRestartCount(resource: BackendResourceDetail): number | undefined {
  const evidence = resource.issues
    .flatMap((issue) => issue.evidence)
    .find((entry) => entry.label.toLowerCase() === "restarts");
  return evidence ? Number(evidence.value) : undefined;
}

function findNodeName(resource: BackendResourceDetail): string | undefined {
  const relation = resource.relations.find((entry) => entry.type === "runs-on");
  if (!relation) {
    return undefined;
  }
  return parseBackendResourceKey(relation.toKey).name;
}

function toFrontendChangeType(changeType: "added" | "removed" | "status_changed" | "spec_changed") {
  if (changeType === "status_changed") {
    return "status" as const;
  }
  if (changeType === "spec_changed") {
    return "spec" as const;
  }
  return changeType === "added" ? ("appeared" as const) : ("disappeared" as const);
}

function parseBackendResourceKey(key: string): {
  kind: ResourceKind;
  namespace: string;
  name: string;
} {
  const [kind, remainder] = key.split(":");
  if (!remainder) {
    return {
      kind: kind as ResourceKind,
      namespace: "_cluster",
      name: key
    };
  }

  const slashIndex = remainder.indexOf("/");
  if (slashIndex === -1) {
    return {
      kind: kind as ResourceKind,
      namespace: "_cluster",
      name: remainder
    };
  }

  return {
    kind: kind as ResourceKind,
    namespace: remainder.slice(0, slashIndex),
    name: remainder.slice(slashIndex + 1)
  };
}

function buildBackendResourceKey(kind: string, name: string, namespace?: string): string {
  return namespace && namespace !== "_cluster" ? `${kind}:${namespace}/${name}` : `${kind}:${name}`;
}

function isPlatformNamespace(namespace: string): boolean {
  return namespace.startsWith("kube-") || namespace === "monitoring" || namespace === "ingress-nginx";
}
