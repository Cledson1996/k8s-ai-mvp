export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type AnalysisSource = "rule" | "prometheus" | "k8sgpt";

export type IssueCategory =
  | "reliability"
  | "capacity"
  | "configuration"
  | "availability"
  | "observability";

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

export interface WorkloadSummary {
  kind: string;
  name: string;
  namespace: string;
  replicas?: number;
  readyReplicas?: number;
  cpuCores?: number;
  memoryBytes?: number;
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
  pressure: string[];
  podCount: number;
  topWorkloads: WorkloadSummary[];
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

export interface ChatCitation {
  type: "issue" | "node" | "namespace" | "pod";
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
  degradedSources: string[];
}

export interface ChatRequest {
  question: string;
}
