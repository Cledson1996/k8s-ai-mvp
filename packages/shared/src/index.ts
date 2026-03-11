export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type AnalysisSource = "rule" | "prometheus" | "k8sgpt";

export type IssueCategory =
  | "reliability"
  | "capacity"
  | "configuration"
  | "availability"
  | "observability"
  | "rollout"
  | "autoscaling"
  | "networking"
  | "cleanup";

export type ResourceKind =
  | "Namespace"
  | "Node"
  | "Deployment"
  | "ReplicaSet"
  | "StatefulSet"
  | "DaemonSet"
  | "Pod"
  | "Service"
  | "EndpointSlice"
  | "Ingress"
  | "IngressClass"
  | "HorizontalPodAutoscaler"
  | "PodDisruptionBudget"
  | "ServiceAccount"
  | "Job"
  | "CronJob"
  | "PersistentVolumeClaim"
  | "ConfigMap"
  | "Secret";

export type ResourceCategory =
  | "cluster"
  | "workload"
  | "network"
  | "batch"
  | "storage"
  | "configuration"
  | "autoscaling"
  | "identity"
  | "policy";

export type ResourceRelationType =
  | "owns"
  | "selects"
  | "exposes"
  | "mounts"
  | "references-config"
  | "references-secret"
  | "runs-on"
  | "belongs-to"
  | "scales"
  | "targets"
  | "backs"
  | "protects"
  | "uses-account";

export type SnapshotChangeType =
  | "added"
  | "removed"
  | "status_changed"
  | "spec_changed";

export interface ResourceRef {
  kind: string;
  name: string;
  namespace?: string;
  nodeName?: string;
}

export interface IssueEvidence {
  label: string;
  value: string;
}

export interface PlaybookStep {
  title: string;
  detail: string;
}

export interface Issue {
  id: string;
  title: string;
  severity: Severity;
  category: IssueCategory;
  source: AnalysisSource;
  resourceRef?: ResourceRef;
  summary: string;
  evidence: IssueEvidence[];
  recommendation: string;
  playbook: PlaybookStep[];
  suggestedCommands: string[];
  detectedAt: string;
}

export interface ResourceUsage {
  cpuCores?: number;
  cpuPercent?: number;
  memoryBytes?: number;
  memoryPercent?: number;
}

export interface CapacityBreakdown {
  total?: number;
  used?: number;
  available?: number;
}

export interface WorkloadSummary {
  kind: string;
  name: string;
  namespace: string;
  key?: string;
  replicas?: number;
  readyReplicas?: number;
  cpuCores?: number;
  memoryBytes?: number;
  restartCount?: number;
  issueCount?: number;
}

export interface PodHealth {
  name: string;
  namespace: string;
  phase: string;
  nodeName?: string;
  restarts: number;
  ready: boolean;
  reason?: string;
  cpuCores?: number;
  memoryBytes?: number;
  missingResources: boolean;
}

export interface NamespaceHealth {
  name: string;
  podCount: number;
  unhealthyPodCount: number;
  restartCount: number;
  cpuCores?: number;
  memoryBytes?: number;
}

export interface NodeHealth {
  name: string;
  status: string;
  roles: string[];
  taints: string[];
  usage: ResourceUsage;
  capacity: {
    cpu: CapacityBreakdown;
    memory: CapacityBreakdown;
    storage: CapacityBreakdown;
  };
  pressure: string[];
  podCount: number;
  topWorkloads: WorkloadSummary[];
  workloads: WorkloadSummary[];
}

export interface DeploymentInventory {
  key: string;
  name: string;
  namespace: string;
  status: string;
  health: "healthy" | "warning" | "critical" | "unknown";
  desiredReplicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  rolloutDegraded: boolean;
  autoscaling?: AutoscalingStatus;
  exposure?: ExposureStatus;
  resilience?: ResilienceStatus;
  references: Array<{
    kind: "ConfigMap" | "Secret" | "PersistentVolumeClaim";
    name: string;
    namespace?: string;
  }>;
  cleanupSignals: string[];
  topIssues: Issue[];
  suggestedCommands: string[];
}

export interface ClusterOverview {
  clusterName: string;
  collectedAt: string;
  nodeCount: number;
  namespaceCount: number;
  podCount: number;
  unhealthyPodCount: number;
  totalRestarts: number;
  usage: ResourceUsage;
  topNamespaces: NamespaceHealth[];
  topRestarts: PodHealth[];
  highlightedIssues: Issue[];
}

export interface AnalysisSnapshot {
  overview: ClusterOverview;
  nodes: NodeHealth[];
  namespaces: NamespaceHealth[];
  pods: PodHealth[];
  issues: Issue[];
}

export interface ResourceSummary {
  key: string;
  kind: ResourceKind;
  category: ResourceCategory;
  name: string;
  namespace?: string;
  status: string;
  labels: string[];
  usage?: ResourceUsage;
  issueCount: number;
  relationCount: number;
  parentKey?: string;
  replicas?: {
    desired?: number;
    ready?: number;
  };
}

export interface ResourceRelation {
  fromKey: string;
  toKey: string;
  type: ResourceRelationType;
  label: string;
}

export interface ResourceEvent {
  type: string;
  reason: string;
  message: string;
  count?: number;
  lastSeen?: string;
}

export interface RolloutStatus {
  desiredReplicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  unavailableReplicas?: number;
  paused?: boolean;
  progressing?: boolean;
  currentRevision?: string;
  updatedRevision?: string;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  events: ResourceEvent[];
}

export interface AutoscalingStatus {
  enabled: boolean;
  sourceKind?: "HorizontalPodAutoscaler";
  name?: string;
  namespace?: string;
  minReplicas?: number;
  maxReplicas?: number;
  currentReplicas?: number;
  desiredReplicas?: number;
  targetKind?: string;
  targetName?: string;
  cpuTargetUtilization?: number;
  currentCpuUtilization?: number;
  memoryTargetUtilization?: number;
  currentMemoryUtilization?: number;
  atMaxReplicas?: boolean;
  conditions: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
}

export interface ExposureStatus {
  services: Array<{
    name: string;
    namespace?: string;
    type?: string;
    ports: string[];
    selector?: string;
    readyEndpoints?: number;
    totalEndpoints?: number;
    endpointSlices: Array<{
      name: string;
      readyEndpoints: number;
      totalEndpoints: number;
      backingPods?: string[];
    }>;
  }>;
  ingresses: Array<{
    name: string;
    namespace?: string;
    ingressClassName?: string;
    hosts: string[];
    tlsSecrets: string[];
    backendServices: string[];
    defaultBackendService?: string;
  }>;
}

export interface SchedulingStatus {
  serviceAccountName?: string;
  imagePullSecrets: string[];
  nodeSelector: string[];
  tolerations: string[];
  affinitySummary: string[];
  topologySpread: string[];
}

export interface ResilienceStatus {
  hasReadinessProbe: boolean;
  hasLivenessProbe: boolean;
  hasStartupProbe: boolean;
  podDisruptionBudgets: Array<{
    name: string;
    namespace?: string;
    minAvailable?: string;
    maxUnavailable?: string;
    disruptionsAllowed?: number;
  }>;
  hasPodDisruptionBudget: boolean;
  hasAntiAffinity: boolean;
  risks: string[];
}

export interface ResourceHistoryEntry {
  resourceKey: string;
  snapshotId: string;
  collectedAt: string;
  changeType: SnapshotChangeType;
  kind: ResourceKind;
  namespace?: string;
  name: string;
  previousStatus?: string;
  currentStatus?: string;
  summary: string;
}

export interface ResourceDetail extends ResourceSummary {
  metrics?: ResourceUsage;
  issues: Issue[];
  suggestedCommands: string[];
  manifestYaml?: string;
  relations: ResourceRelation[];
  insights: string[];
  references: Array<{
    kind: "ConfigMap" | "Secret" | "PersistentVolumeClaim";
    name: string;
    namespace?: string;
  }>;
  rollout?: RolloutStatus;
  autoscaling?: AutoscalingStatus;
  exposure?: ExposureStatus;
  scheduling?: SchedulingStatus;
  resilience?: ResilienceStatus;
  cleanupSignals?: string[];
  events?: ResourceEvent[];
  history: ResourceHistoryEntry[];
}

export interface NamespaceInventory {
  name: string;
  health: NamespaceHealth;
  resourceCounts: Partial<Record<ResourceKind, number>>;
  resources: ResourceSummary[];
  topIssues: Issue[];
}

export interface SnapshotSummary {
  id: string;
  clusterName: string;
  collectedAt: string;
  resourceCount: number;
  issueCount: number;
}

export interface SnapshotDiff {
  snapshotId: string;
  previousSnapshotId: string;
  collectedAt: string;
  previousCollectedAt: string;
  added: ResourceHistoryEntry[];
  removed: ResourceHistoryEntry[];
  changed: ResourceHistoryEntry[];
}

export interface ClusterSnapshot {
  id: string;
  clusterName: string;
  collectedAt: string;
  overview: ClusterOverview;
  nodes: NodeHealth[];
  deployments?: DeploymentInventory[];
  namespaces: NamespaceInventory[];
  pods: PodHealth[];
  issues: Issue[];
  resources: ResourceSummary[];
  relations: ResourceRelation[];
  degradedSources: string[];
}

export interface ChatCitation {
  type: "issue" | "node" | "namespace" | "pod" | "resource";
  label: string;
  issueId?: string;
}

export interface ChatAnswer {
  answer: string;
  citations: ChatCitation[];
  suggestedFollowUps: string[];
  generatedAt: string;
}

export interface AnalysisRunResponse {
  snapshot: AnalysisSnapshot;
  clusterSnapshot?: ClusterSnapshot;
  degradedSources: string[];
}

export interface ChatRequest {
  question: string;
}

export interface NamespacesResponse {
  namespaces: NamespaceInventory[];
  snapshot: SnapshotSummary;
  degradedSources: string[];
}

export interface NamespaceDetailResponse {
  namespace: NamespaceInventory;
  snapshot: SnapshotSummary;
}

export interface ResourceDetailResponse {
  resource: ResourceDetail;
  snapshot: SnapshotSummary;
}

export interface ResourceRelationsResponse {
  relations: ResourceRelation[];
  snapshot: SnapshotSummary;
}

export interface SnapshotsResponse {
  snapshots: SnapshotSummary[];
}

export interface SnapshotDiffResponse {
  diff: SnapshotDiff;
}

export interface DeploymentsResponse {
  deployments: DeploymentInventory[];
  snapshot: SnapshotSummary;
  degradedSources: string[];
}

export interface WorkloadStatusCount {
  status: string;
  count: number;
}

export interface WorkloadCardSummary {
  kind: string;
  label: string;
  total: number;
  statuses: WorkloadStatusCount[];
}

export interface WorkloadPodDetail {
  name: string;
  namespace: string;
  phase: string;
  nodeName?: string;
  restarts: number;
  ready: boolean;
  reason?: string;
  cpuCores?: number;
  memoryBytes?: number;
  age: string;
  controllerKind?: string;
  controllerName?: string;
  events: ResourceEvent[];
}

export interface WorkloadsResponse {
  cards: WorkloadCardSummary[];
  pods: WorkloadPodDetail[];
  degradedSources: string[];
}
