import type { Issue } from "@k8s-ai-mvp/shared";

export type ResourceHealth = "healthy" | "warning" | "critical" | "unknown";

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

export interface ResourceSummary {
  kind: ResourceKind;
  name: string;
  namespace: string;
  status: string;
  health: ResourceHealth;
  summary: string;
  ready?: number;
  desired?: number;
  podCount?: number;
  issueCount: number;
  cpuCores?: number;
  memoryBytes?: number;
  labels?: string[];
  scope?: "application" | "platform";
}

export interface CapacityBreakdown {
  total?: number;
  used?: number;
  available?: number;
}

export type MetricWindow = "1h" | "6h" | "24h" | "7d";

export interface UsageMetricSummary {
  avg?: number;
  max?: number;
}

export interface UsageHistorySummary {
  window: MetricWindow;
  cpu: UsageMetricSummary;
  memory: UsageMetricSummary;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export interface ResourceHistorySeries {
  key: string;
  label: string;
  points: TimeSeriesPoint[];
}

export interface NodeWorkloadSummary {
  key?: string;
  kind: string;
  name: string;
  namespace: string;
  replicas?: number;
  readyReplicas?: number;
  cpuCores?: number;
  memoryBytes?: number;
  restartCount?: number;
  issueCount?: number;
}

export interface NodeCapacityView {
  cpu: CapacityBreakdown;
  memory: CapacityBreakdown;
  storage: CapacityBreakdown;
}

export interface NamespaceInventory {
  name: string;
  status: ResourceHealth;
  summary: string;
  podCount: number;
  resourceCount: number;
  unhealthyResourceCount: number;
  issueCount: number;
  cpuCores?: number;
  memoryBytes?: number;
  kinds: Array<{ kind: ResourceKind; count: number }>;
  resources: ResourceSummary[];
  issues: Issue[];
}

export interface ResourceRelation {
  type: string;
  direction: "incoming" | "outgoing";
  target: {
    kind: ResourceKind;
    namespace: string;
    name: string;
  };
  title: string;
  detail: string;
}

export interface ResourceHistoryEntry {
  id: string;
  timestamp: string;
  changeType: "appeared" | "disappeared" | "status" | "spec";
  title: string;
  detail: string;
}

export interface ResourceEvent {
  type: string;
  reason: string;
  message: string;
  count?: number;
  lastSeen?: string;
}

export interface RolloutCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface ResourceRollout {
  desiredReplicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  unavailableReplicas?: number;
  paused: boolean;
  progressing?: boolean;
  currentRevision?: string;
  updatedRevision?: string;
  conditions: RolloutCondition[];
  events: ResourceEvent[];
}

export interface AutoscalingCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

export interface ResourceAutoscaling {
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
  atMaxReplicas: boolean;
  conditions: AutoscalingCondition[];
}

export interface ExposureEndpointSlice {
  name: string;
  readyEndpoints: number;
  totalEndpoints: number;
  backingPods?: string[];
}

export interface ExposureService {
  name: string;
  namespace: string;
  type?: string;
  ports: string[];
  selector?: string;
  readyEndpoints?: number;
  totalEndpoints?: number;
  endpointSlices: ExposureEndpointSlice[];
}

export interface ExposureIngress {
  name: string;
  namespace: string;
  ingressClassName?: string;
  hosts: string[];
  tlsSecrets: string[];
  backendServices: string[];
  defaultBackendService?: string;
}

export interface ResourceExposure {
  services: ExposureService[];
  ingresses: ExposureIngress[];
}

export interface ResourceScheduling {
  serviceAccountName?: string;
  imagePullSecrets: string[];
  nodeSelector: string[];
  tolerations: string[];
  affinitySummary: string[];
  topologySpread: string[];
}

export interface ResiliencePdb {
  name: string;
  namespace: string;
  minAvailable?: string;
  maxUnavailable?: string;
  disruptionsAllowed?: number;
}

export interface ResourceResilience {
  hasReadinessProbe: boolean;
  hasLivenessProbe: boolean;
  hasStartupProbe: boolean;
  podDisruptionBudgets: ResiliencePdb[];
  hasPodDisruptionBudget: boolean;
  hasAntiAffinity: boolean;
  risks: string[];
}

export interface ResourceDetail {
  resource: ResourceSummary & {
    createdAt?: string;
    nodeName?: string;
  };
  metrics: {
    cpuCores?: number;
    memoryBytes?: number;
    restartCount?: number;
  };
  issues: Issue[];
  suggestedCommands: string[];
  manifestYaml?: string;
  relations: ResourceRelation[];
  history: ResourceHistoryEntry[];
  rollout?: ResourceRollout;
  autoscaling?: ResourceAutoscaling;
  exposure?: ResourceExposure;
  scheduling?: ResourceScheduling;
  resilience?: ResourceResilience;
  cleanupSignals?: string[];
  events?: ResourceEvent[];
  insights: string[];
  references: Array<{
    kind: "ConfigMap" | "Secret" | "PersistentVolumeClaim";
    name: string;
    namespace?: string;
  }>;
}

export interface DeploymentInventory {
  key: string;
  name: string;
  namespace: string;
  status: string;
  health: ResourceHealth;
  desiredReplicas?: number;
  readyReplicas?: number;
  updatedReplicas?: number;
  availableReplicas?: number;
  rolloutDegraded: boolean;
  autoscaling?: ResourceAutoscaling;
  exposure?: ResourceExposure;
  resilience?: ResourceResilience;
  references: Array<{
    kind: "ConfigMap" | "Secret" | "PersistentVolumeClaim";
    name: string;
    namespace?: string;
  }>;
  history?: UsageHistorySummary;
  cleanupSignals: string[];
  topIssues: Issue[];
  suggestedCommands: string[];
}

export interface DeploymentMetricsResponse {
  deployment: {
    key: string;
    name: string;
    namespace: string;
  };
  window: MetricWindow;
  summary: UsageHistorySummary;
  cpu: {
    aggregate: ResourceHistorySeries;
    pods: ResourceHistorySeries[];
  };
  memory: {
    aggregate: ResourceHistorySeries;
    pods: ResourceHistorySeries[];
  };
  degradedSources: string[];
}

export type DeploymentAnalysisRisk = "healthy" | "warning" | "critical";

export type DeploymentAnalysisCategory =
  | "rollout"
  | "availability"
  | "autoscaling"
  | "capacity"
  | "networking"
  | "configuration"
  | "security"
  | "cleanup";

export interface DeploymentAnalysisScorecard {
  category: DeploymentAnalysisCategory;
  label: string;
  risk: DeploymentAnalysisRisk;
  summary: string;
}

export interface DeploymentAnalysisFinding {
  id: string;
  category: DeploymentAnalysisCategory;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  resource: {
    kind: string;
    name: string;
    namespace?: string;
    nodeName?: string;
  };
  evidence: Array<{
    label: string;
    value: string;
  }>;
  impact: string;
  recommendation: string;
}

export interface DeploymentImprovementSuggestion {
  id: string;
  title: string;
  priority: "critical" | "high" | "medium" | "low" | "info";
  summary: string;
  resource?: {
    kind: string;
    name: string;
    namespace?: string;
    nodeName?: string;
  };
}

export interface SuggestedYamlPatch {
  resource: {
    kind: string;
    name: string;
    namespace?: string;
    nodeName?: string;
  };
  reason: string;
  yaml: string;
  note: string;
}

export interface DeploymentAnalysisRelatedResource {
  key: string;
  kind: ResourceKind;
  name: string;
  namespace?: string;
  role: string;
  status?: string;
  summary: string;
  manifestYaml?: string;
}

export interface DeploymentAnalysisResponse {
  deployment: {
    key: string;
    name: string;
    namespace: string;
  };
  generatedAt: string;
  usedSources: string[];
  degradedSources: string[];
  executiveSummary: string;
  overallRisk: DeploymentAnalysisRisk;
  scorecards: DeploymentAnalysisScorecard[];
  findings: DeploymentAnalysisFinding[];
  improvements: DeploymentImprovementSuggestion[];
  reviewCommands: string[];
  suggestedYamlPatches: SuggestedYamlPatch[];
  relatedResources: DeploymentAnalysisRelatedResource[];
}

export interface NodeMetricsResponse {
  node: {
    name: string;
  };
  window: MetricWindow;
  summary: UsageHistorySummary;
  cpu: ResourceHistorySeries;
  memory: ResourceHistorySeries;
  degradedSources: string[];
}

export interface ClusterSnapshot {
  id: string;
  clusterName: string;
  collectedAt: string;
  namespaceCount: number;
  resourceCount: number;
  issueCount: number;
  changeCount: number;
}

export interface SnapshotDiffChange {
  changeType: "added" | "removed" | "changed";
  resource: {
    kind: ResourceKind;
    namespace: string;
    name: string;
  };
  detail: string;
}

export interface SnapshotDiff {
  currentSnapshotId: string;
  previousSnapshotId: string;
  generatedAt: string;
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  changes: SnapshotDiffChange[];
}
