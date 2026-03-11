import { randomUUID } from "node:crypto";
import type {
  ClusterOverview,
  ClusterSnapshot,
  DeploymentInventory,
  Issue,
  NamespaceHealth,
  NamespaceInventory,
  NodeHealth,
  PodHealth,
  ResourceCategory,
  ResourceDetail,
  ResourceKind,
  ResourceRelation,
  ResourceRelationType,
  ResourceSummary,
  WorkloadSummary
} from "@k8s-ai-mvp/shared";
import type {
  V1ConfigMap,
  V1Container,
  V1CronJob,
  V1DaemonSet,
  V1Deployment,
  V1EndpointSlice,
  V1Ingress,
  V1IngressClass,
  V1Job,
  V1Node,
  V1PersistentVolumeClaim,
  V1Pod,
  V1PodDisruptionBudget,
  V1PodSpec,
  V1ReplicaSet,
  V1Secret,
  V1Service,
  V1ServiceAccount,
  V1StatefulSet,
  V2HorizontalPodAutoscaler
} from "@kubernetes/client-node";
import type { ClusterInventory } from "../../connectors/kubernetes.js";
import type { K8sGptFinding } from "../../connectors/k8sgpt.js";
import type { PrometheusMetrics } from "../../connectors/prometheus.js";
import { getPodOwner, getPodPrimaryReason, getPodRestartCount } from "../../lib/helpers.js";
import { formatCpu, formatMemory, parseCpu, parseMemory } from "../../lib/quantity.js";
import { buildRuleIssues } from "../analysis/rules.js";

export interface BuiltSnapshot {
  clusterSnapshot: ClusterSnapshot;
  analysisSnapshot: {
    overview: ClusterOverview;
    nodes: NodeHealth[];
    namespaces: NamespaceHealth[];
    pods: PodHealth[];
    issues: Issue[];
  };
  detailsByKey: Record<string, ResourceDetail>;
}

interface BuildSnapshotInput {
  inventory: ClusterInventory;
  metrics: PrometheusMetrics;
  k8sGptFindings: K8sGptFinding[];
  degradedSources: string[];
}

interface ResourceBuildContext {
  resources: Map<string, ResourceSummary>;
  details: Map<string, ResourceDetail>;
  relations: Map<string, ResourceRelation>;
}

interface ReferenceTarget {
  kind: "ConfigMap" | "Secret" | "PersistentVolumeClaim";
  name: string;
  namespace?: string;
}

type Workload = V1Deployment | V1ReplicaSet | V1StatefulSet | V1DaemonSet;
type SelectorWorkload = Workload;

export function buildClusterSnapshot(input: BuildSnapshotInput): BuiltSnapshot {
  const { inventory, metrics, k8sGptFindings, degradedSources } = input;
  const pods = inventory.pods.map((pod) => mapPodHealth(pod, metrics));
  const workloadUsage = buildWorkloadUsage(inventory.pods, metrics, pods);
  const nodes = inventory.nodes.map((node) => mapNodeHealth(node, inventory.pods, workloadUsage, metrics));
  const namespaceHealth = buildNamespaceHealth(inventory, pods, metrics);
  const issues = buildRuleIssues({
    collectedAt: inventory.collectedAt,
    pods,
    nodes,
    namespaces: namespaceHealth,
    deployments: inventory.deployments,
    rawPods: inventory.pods,
    workloadUsage,
    k8sGptFindings,
    services: inventory.services,
    ingresses: inventory.ingresses,
    endpointSlices: inventory.endpointSlices,
    horizontalPodAutoscalers: inventory.horizontalPodAutoscalers,
    replicaSets: inventory.replicaSets,
    podDisruptionBudgets: inventory.podDisruptionBudgets,
    jobs: inventory.jobs,
    cronJobs: inventory.cronJobs,
    persistentVolumeClaims: inventory.persistentVolumeClaims,
    configMaps: inventory.configMaps,
    secrets: inventory.secrets
  });
  const overview = buildOverview(inventory, namespaceHealth, pods, issues, metrics);
  const enrichedNodes = enrichNodeWorkloads(nodes, issues);

  const context: ResourceBuildContext = {
    resources: new Map(),
    details: new Map(),
    relations: new Map()
  };

  addNamespaceResources(context, inventory, namespaceHealth);
  addNodeResources(context, nodes, issues);
  addWorkloadResources(context, inventory.deployments, "Deployment", "workload", workloadUsage, issues);
  addReplicaSetResources(context, inventory.replicaSets, issues);
  addWorkloadResources(context, inventory.statefulSets, "StatefulSet", "workload", workloadUsage, issues);
  addWorkloadResources(context, inventory.daemonSets, "DaemonSet", "workload", workloadUsage, issues);
  addHorizontalPodAutoscalerResources(context, inventory.horizontalPodAutoscalers, issues);
  addJobResources(context, inventory.jobs, issues);
  addCronJobResources(context, inventory.cronJobs, issues);
  addPodResources(context, inventory.pods, pods, issues);
  addServiceResources(context, inventory.services, issues);
  addEndpointSliceResources(context, inventory.endpointSlices, issues);
  addIngressResources(context, inventory.ingresses, issues);
  addIngressClassResources(context, inventory.ingressClasses, issues);
  addPodDisruptionBudgetResources(context, inventory.podDisruptionBudgets, issues);
  addServiceAccountResources(context, inventory.serviceAccounts, issues);
  addSecretResources(context, inventory.secrets, issues);
  addPvcResources(context, inventory.persistentVolumeClaims, issues);
  addConfigMapResources(context, inventory.configMaps, issues);
  addReplicaSetRelations(context, inventory.replicaSets, inventory.pods);
  addWorkloadRelations(context, inventory.deployments, "Deployment");
  addWorkloadRelations(context, inventory.statefulSets, "StatefulSet");
  addWorkloadRelations(context, inventory.daemonSets, "DaemonSet");
  addHorizontalPodAutoscalerRelations(context, inventory.horizontalPodAutoscalers);
  addJobRelations(context, inventory.jobs, inventory.cronJobs);
  addServiceRelations(context, inventory.services, [
    ...inventory.deployments.map((resource) => ({ kind: "Deployment" as const, resource })),
    ...inventory.replicaSets.map((resource) => ({ kind: "ReplicaSet" as const, resource })),
    ...inventory.statefulSets.map((resource) => ({ kind: "StatefulSet" as const, resource })),
    ...inventory.daemonSets.map((resource) => ({ kind: "DaemonSet" as const, resource }))
  ]);
  addEndpointSliceRelations(context, inventory.endpointSlices);
  addIngressRelations(context, inventory.ingresses, inventory.services);
  addPodDisruptionBudgetRelations(context, inventory.podDisruptionBudgets, inventory.deployments, inventory.statefulSets);
  addServiceAccountRelations(context, inventory.pods, inventory.deployments, inventory.statefulSets, inventory.daemonSets, inventory.jobs, inventory.cronJobs);
  addPodRelations(context, inventory.pods);
  enrichWorkloadDetails(context, inventory, issues);

  const resources = Array.from(context.resources.values()).sort(sortResources);
  const relations = Array.from(context.relations.values()).sort(
    (left, right) => left.fromKey.localeCompare(right.fromKey) || left.toKey.localeCompare(right.toKey)
  );

  for (const summary of resources) {
    const detail = context.details.get(summary.key);
    if (!detail) {
      continue;
    }

    detail.history = [];
    detail.relations = relations.filter((relation) => relation.fromKey === detail.key || relation.toKey === detail.key);
    detail.relationCount = detail.relations.length;
    detail.issueCount = detail.issues.length;
    summary.relationCount = detail.relationCount;
    summary.issueCount = detail.issueCount;
  }

  const clusterSnapshot: ClusterSnapshot = {
    id: randomUUID(),
    clusterName: inventory.clusterName,
    collectedAt: inventory.collectedAt,
    overview,
    nodes: enrichedNodes,
    deployments: buildDeploymentInventories(inventory, context, issues),
    namespaces: buildNamespaceInventories(resources, namespaceHealth, issues),
    pods,
    issues,
    resources,
    relations,
    degradedSources
  };

  return {
    clusterSnapshot,
    analysisSnapshot: {
      overview,
      nodes: enrichedNodes,
      namespaces: namespaceHealth,
      pods,
      issues
    },
    detailsByKey: Object.fromEntries(context.details.entries())
  };
}

function addNamespaceResources(
  context: ResourceBuildContext,
  inventory: ClusterInventory,
  namespaceHealth: NamespaceHealth[]
) {
  for (const namespace of inventory.namespaces) {
    const name = namespace.metadata?.name ?? "default";
    const health = namespaceHealth.find((item) => item.name === name);
    const key = resourceKey("Namespace", name);
    const summary: ResourceSummary = {
      key,
      kind: "Namespace",
      category: "cluster",
      name,
      status: namespace.status?.phase ?? "Active",
      labels: labelsAsList(namespace.metadata?.labels),
      usage: {
        cpuCores: health?.cpuCores,
        memoryBytes: health?.memoryBytes
      },
      issueCount: 0,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      metrics: summary.usage,
      issues: [],
      suggestedCommands: [
        `kubectl get all -n ${name}`,
        `kubectl get events -n ${name} --sort-by=.lastTimestamp`
      ],
      relations: [],
      insights: [
        `${health?.podCount ?? 0} pods observados neste namespace.`,
        `${health?.restartCount ?? 0} restarts acumulados na ultima coleta.`
      ],
      references: [],
      history: []
    });
  }
}

function addNodeResources(context: ResourceBuildContext, nodes: NodeHealth[], issues: Issue[]) {
  for (const node of nodes) {
    const key = resourceKey("Node", node.name);
    const nodeIssues = issues.filter((issue) => issue.resourceRef?.kind === "Node" && issue.resourceRef.name === node.name);
    const summary: ResourceSummary = {
      key,
      kind: "Node",
      category: "cluster",
      name: node.name,
      status: node.status,
      labels: node.roles,
      usage: node.usage,
      issueCount: nodeIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      metrics: node.usage,
      issues: nodeIssues,
      suggestedCommands: [
        `kubectl describe node ${node.name}`,
        `kubectl top pod -A --field-selector spec.nodeName=${node.name}`
      ],
      relations: [],
      insights: [
        `Roles: ${node.roles.join(", ") || "none"}.`,
        `Taints: ${node.taints.join(", ") || "none"}.`
      ],
      references: [],
      history: []
    });
  }
}

function addWorkloadResources<T extends Workload>(
  context: ResourceBuildContext,
  workloads: T[],
  kind: "Deployment" | "StatefulSet" | "DaemonSet",
  category: ResourceCategory,
  workloadUsage: Map<string, WorkloadSummary>,
  issues: Issue[]
) {
  for (const workload of workloads) {
    const namespace = workload.metadata?.namespace ?? "default";
    const name = workload.metadata?.name ?? "unknown";
    const key = resourceKey(kind, name, namespace);
    const usage = workloadUsage.get(workloadUsageKey(kind, name, namespace));
    const workloadIssues = issues.filter((issue) => matchesIssue(issue, kind, name, namespace));
    const summary: ResourceSummary = {
      key,
      kind,
      category,
      name,
      namespace,
      status: workloadStatus(workload),
      labels: labelsAsList(workload.spec?.template?.metadata?.labels),
      usage: usage
        ? {
            cpuCores: usage.cpuCores,
            memoryBytes: usage.memoryBytes
          }
        : undefined,
      issueCount: workloadIssues.length,
      relationCount: 0,
      replicas: {
        desired: desiredReplicas(workload),
        ready: readyReplicas(workload)
      }
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      metrics: summary.usage,
      issues: workloadIssues,
      suggestedCommands: [
        `kubectl describe ${kind.toLowerCase()} ${name} -n ${namespace}`,
        `kubectl get ${kind.toLowerCase()} ${name} -n ${namespace} -o yaml`
      ],
      relations: [],
      insights: buildWorkloadInsights(kind, workload, usage),
      references: extractReferences(workload.spec?.template?.spec, namespace),
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addReplicaSetResources(context: ResourceBuildContext, replicaSets: V1ReplicaSet[], issues: Issue[]) {
  for (const replicaSet of replicaSets) {
    const namespace = replicaSet.metadata?.namespace ?? "default";
    const name = replicaSet.metadata?.name ?? "unknown";
    const key = resourceKey("ReplicaSet", name, namespace);
    const replicaSetIssues = issues.filter((issue) => matchesIssue(issue, "ReplicaSet", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "ReplicaSet",
      category: "workload",
      name,
      namespace,
      status: workloadStatus(replicaSet),
      labels: labelsAsList(replicaSet.spec?.template?.metadata?.labels),
      issueCount: replicaSetIssues.length,
      relationCount: 0,
      replicas: {
        desired: replicaSet.spec?.replicas,
        ready: replicaSet.status?.readyReplicas
      }
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: replicaSetIssues,
      suggestedCommands: [
        `kubectl describe replicaset ${name} -n ${namespace}`,
        `kubectl get replicaset ${name} -n ${namespace} -o yaml`
      ],
      relations: [],
      insights: [`Replicas: ready ${replicaSet.status?.readyReplicas ?? 0}/${replicaSet.spec?.replicas ?? 0}.`],
      references: extractReferences(replicaSet.spec?.template?.spec, namespace),
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addHorizontalPodAutoscalerResources(
  context: ResourceBuildContext,
  horizontalPodAutoscalers: V2HorizontalPodAutoscaler[],
  issues: Issue[]
) {
  for (const hpa of horizontalPodAutoscalers) {
    const namespace = hpa.metadata?.namespace ?? "default";
    const name = hpa.metadata?.name ?? "unknown";
    const key = resourceKey("HorizontalPodAutoscaler", name, namespace);
    const hpaIssues = issues.filter((issue) => matchesIssue(issue, "HorizontalPodAutoscaler", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "HorizontalPodAutoscaler",
      category: "autoscaling",
      name,
      namespace,
      status: `${hpa.status?.currentReplicas ?? 0}->${hpa.status?.desiredReplicas ?? 0}`,
      labels: labelsAsList(hpa.metadata?.labels),
      issueCount: hpaIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: hpaIssues,
      suggestedCommands: [
        `kubectl describe hpa ${name} -n ${namespace}`,
        `kubectl get hpa ${name} -n ${namespace} -o yaml`
      ],
      relations: [],
      insights: [
        `Replicas: ${hpa.status?.currentReplicas ?? 0}/${hpa.status?.desiredReplicas ?? 0}.`,
        `Limits: min ${hpa.spec?.minReplicas ?? 1}, max ${hpa.spec?.maxReplicas ?? 0}.`
      ],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addJobResources(context: ResourceBuildContext, jobs: V1Job[], issues: Issue[]) {
  for (const job of jobs) {
    const namespace = job.metadata?.namespace ?? "default";
    const name = job.metadata?.name ?? "unknown";
    const key = resourceKey("Job", name, namespace);
    const jobIssues = issues.filter((issue) => matchesIssue(issue, "Job", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "Job",
      category: "batch",
      name,
      namespace,
      status: jobStatus(job),
      labels: labelsAsList(job.spec?.template.metadata?.labels),
      issueCount: jobIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: jobIssues,
      suggestedCommands: [
        `kubectl describe job ${name} -n ${namespace}`,
        `kubectl logs job/${name} -n ${namespace}`
      ],
      relations: [],
      insights: [`Succeeded: ${job.status?.succeeded ?? 0}. Failed: ${job.status?.failed ?? 0}.`],
      references: extractReferences(job.spec?.template.spec, namespace),
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addCronJobResources(context: ResourceBuildContext, cronJobs: V1CronJob[], issues: Issue[]) {
  for (const cronJob of cronJobs) {
    const namespace = cronJob.metadata?.namespace ?? "default";
    const name = cronJob.metadata?.name ?? "unknown";
    const key = resourceKey("CronJob", name, namespace);
    const cronIssues = issues.filter((issue) => matchesIssue(issue, "CronJob", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "CronJob",
      category: "batch",
      name,
      namespace,
      status: cronJob.spec?.suspend ? "Suspended" : "Scheduled",
      labels: labelsAsList(cronJob.spec?.jobTemplate.spec?.template.metadata?.labels),
      issueCount: cronIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: cronIssues,
      suggestedCommands: [
        `kubectl describe cronjob ${name} -n ${namespace}`,
        `kubectl get cronjob ${name} -n ${namespace} -o yaml`
      ],
      relations: [],
      insights: [`Schedule: ${cronJob.spec?.schedule ?? "unknown"}.`],
      references: extractReferences(cronJob.spec?.jobTemplate.spec?.template.spec, namespace),
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addPodResources(context: ResourceBuildContext, rawPods: V1Pod[], pods: PodHealth[], issues: Issue[]) {
  for (const pod of pods) {
    const key = resourceKey("Pod", pod.name, pod.namespace);
    const podIssues = issues.filter((issue) => matchesIssue(issue, "Pod", pod.name, pod.namespace));
    const rawPod = rawPods.find((item) => item.metadata?.name === pod.name && item.metadata?.namespace === pod.namespace);
    const owner = rawPod ? getPodOwner(rawPod) : undefined;
    const summary: ResourceSummary = {
      key,
      kind: "Pod",
      category: "workload",
      name: pod.name,
      namespace: pod.namespace,
      status: pod.ready ? pod.phase : `${pod.phase}/NotReady`,
      labels: labelsAsList(rawPod?.metadata?.labels),
      usage: {
        cpuCores: pod.cpuCores,
        memoryBytes: pod.memoryBytes
      },
      issueCount: podIssues.length,
      relationCount: 0,
      parentKey: owner ? resourceKey(owner.kind as ResourceKind, owner.name, pod.namespace) : undefined
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      metrics: summary.usage,
      issues: podIssues,
      suggestedCommands: [
        `kubectl describe pod ${pod.name} -n ${pod.namespace}`,
        `kubectl logs ${pod.name} -n ${pod.namespace} --previous`
      ],
      relations: [],
      insights: [
        `Restarts: ${pod.restarts}.`,
        `Ready: ${pod.ready}.`,
        `Reason: ${pod.reason ?? "n/a"}.`
      ],
      references: extractReferences(rawPod?.spec, pod.namespace),
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", pod.namespace), "belongs-to", "scope");
    if (pod.nodeName) {
      addRelation(context, key, resourceKey("Node", pod.nodeName), "runs-on", "scheduled on");
    }
    if (owner) {
      addRelation(context, resourceKey(owner.kind as ResourceKind, owner.name, pod.namespace), key, "owns", "owns pod");
    }
  }
}

function addServiceResources(context: ResourceBuildContext, services: V1Service[], issues: Issue[]) {
  for (const service of services) {
    const namespace = service.metadata?.namespace ?? "default";
    const name = service.metadata?.name ?? "unknown";
    const key = resourceKey("Service", name, namespace);
    const serviceIssues = issues.filter((issue) => matchesIssue(issue, "Service", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "Service",
      category: "network",
      name,
      namespace,
      status: service.spec?.type ?? "ClusterIP",
      labels: labelsAsList(service.metadata?.labels),
      issueCount: serviceIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: serviceIssues,
      suggestedCommands: [
        `kubectl describe service ${name} -n ${namespace}`,
        `kubectl get endpoints ${name} -n ${namespace}`
      ],
      relations: [],
      insights: [
        `Selector: ${renderSelector(service.spec?.selector)}.`,
        `Ports: ${(service.spec?.ports ?? [])
          .map((port) => `${port.port}/${port.protocol ?? "TCP"}`)
          .join(", ") || "none"}.`
      ],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addEndpointSliceResources(context: ResourceBuildContext, endpointSlices: V1EndpointSlice[], issues: Issue[]) {
  for (const endpointSlice of endpointSlices) {
    const namespace = endpointSlice.metadata?.namespace ?? "default";
    const name = endpointSlice.metadata?.name ?? "unknown";
    const key = resourceKey("EndpointSlice", name, namespace);
    const endpointIssues = issues.filter((issue) => matchesIssue(issue, "EndpointSlice", name, namespace));
    const readyEndpoints = (endpointSlice.endpoints ?? []).filter((endpoint) => endpoint.conditions?.ready !== false).length;
    const totalEndpoints = endpointSlice.endpoints?.length ?? 0;
    const summary: ResourceSummary = {
      key,
      kind: "EndpointSlice",
      category: "network",
      name,
      namespace,
      status: `${readyEndpoints}/${totalEndpoints} ready`,
      labels: labelsAsList(endpointSlice.metadata?.labels),
      issueCount: endpointIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: endpointIssues,
      suggestedCommands: [
        `kubectl describe endpointslice ${name} -n ${namespace}`
      ],
      relations: [],
      insights: [
        `Ready endpoints: ${readyEndpoints}/${totalEndpoints}.`
      ],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addIngressResources(context: ResourceBuildContext, ingresses: V1Ingress[], issues: Issue[]) {
  for (const ingress of ingresses) {
    const namespace = ingress.metadata?.namespace ?? "default";
    const name = ingress.metadata?.name ?? "unknown";
    const key = resourceKey("Ingress", name, namespace);
    const ingressIssues = issues.filter((issue) => matchesIssue(issue, "Ingress", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "Ingress",
      category: "network",
      name,
      namespace,
      status: ingress.status?.loadBalancer?.ingress?.length ? "Exposed" : "Pending",
      labels: labelsAsList(ingress.metadata?.labels),
      issueCount: ingressIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: ingressIssues,
      suggestedCommands: [
        `kubectl describe ingress ${name} -n ${namespace}`,
        `kubectl get ingress ${name} -n ${namespace} -o yaml`
      ],
      relations: [],
      insights: [`Hosts: ${(ingress.spec?.rules ?? []).map((rule) => rule.host).filter(Boolean).join(", ") || "none"}.`],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addIngressClassResources(context: ResourceBuildContext, ingressClasses: V1IngressClass[], issues: Issue[]) {
  for (const ingressClass of ingressClasses) {
    const name = ingressClass.metadata?.name ?? "unknown";
    const key = resourceKey("IngressClass", name);
    const ingressClassIssues = issues.filter((issue) => matchesIssue(issue, "IngressClass", name));
    const summary: ResourceSummary = {
      key,
      kind: "IngressClass",
      category: "network",
      name,
      status: ingressClass.spec?.controller ?? "Unknown",
      labels: labelsAsList(ingressClass.metadata?.labels),
      issueCount: ingressClassIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: ingressClassIssues,
      suggestedCommands: [`kubectl describe ingressclass ${name}`],
      relations: [],
      insights: [`Controller: ${ingressClass.spec?.controller ?? "unknown"}.`],
      references: [],
      history: []
    });
  }
}

function addPodDisruptionBudgetResources(
  context: ResourceBuildContext,
  podDisruptionBudgets: V1PodDisruptionBudget[],
  issues: Issue[]
) {
  for (const podDisruptionBudget of podDisruptionBudgets) {
    const namespace = podDisruptionBudget.metadata?.namespace ?? "default";
    const name = podDisruptionBudget.metadata?.name ?? "unknown";
    const key = resourceKey("PodDisruptionBudget", name, namespace);
    const pdbIssues = issues.filter((issue) => matchesIssue(issue, "PodDisruptionBudget", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "PodDisruptionBudget",
      category: "policy",
      name,
      namespace,
      status: `disruptions ${podDisruptionBudget.status?.disruptionsAllowed ?? 0}`,
      labels: labelsAsList(podDisruptionBudget.metadata?.labels),
      issueCount: pdbIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: pdbIssues,
      suggestedCommands: [`kubectl describe pdb ${name} -n ${namespace}`],
      relations: [],
      insights: [
        `Disruptions allowed: ${podDisruptionBudget.status?.disruptionsAllowed ?? 0}.`
      ],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addServiceAccountResources(
  context: ResourceBuildContext,
  serviceAccounts: V1ServiceAccount[],
  issues: Issue[]
) {
  for (const serviceAccount of serviceAccounts) {
    const namespace = serviceAccount.metadata?.namespace ?? "default";
    const name = serviceAccount.metadata?.name ?? "unknown";
    const key = resourceKey("ServiceAccount", name, namespace);
    const serviceAccountIssues = issues.filter((issue) => matchesIssue(issue, "ServiceAccount", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "ServiceAccount",
      category: "identity",
      name,
      namespace,
      status: serviceAccount.automountServiceAccountToken === false ? "ManualToken" : "DefaultToken",
      labels: labelsAsList(serviceAccount.metadata?.labels),
      issueCount: serviceAccountIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: serviceAccountIssues,
      suggestedCommands: [`kubectl describe serviceaccount ${name} -n ${namespace}`],
      relations: [],
      insights: [
        `Image pull secrets: ${(serviceAccount.imagePullSecrets ?? []).map((item) => item.name).join(", ") || "none"}.`
      ],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addSecretResources(context: ResourceBuildContext, secrets: V1Secret[], issues: Issue[]) {
  for (const secret of secrets) {
    const namespace = secret.metadata?.namespace ?? "default";
    const name = secret.metadata?.name ?? "unknown";
    const key = resourceKey("Secret", name, namespace);
    const secretIssues = issues.filter((issue) => matchesIssue(issue, "Secret", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "Secret",
      category: "configuration",
      name,
      namespace,
      status: secret.type ?? "Opaque",
      labels: labelsAsList(secret.metadata?.labels),
      issueCount: secretIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: secretIssues,
      suggestedCommands: [`kubectl describe secret ${name} -n ${namespace}`],
      relations: [],
      insights: ["Secret metadata only; no secret data is read or stored."],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addPvcResources(context: ResourceBuildContext, pvcs: V1PersistentVolumeClaim[], issues: Issue[]) {
  for (const pvc of pvcs) {
    const namespace = pvc.metadata?.namespace ?? "default";
    const name = pvc.metadata?.name ?? "unknown";
    const key = resourceKey("PersistentVolumeClaim", name, namespace);
    const pvcIssues = issues.filter((issue) => matchesIssue(issue, "PersistentVolumeClaim", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "PersistentVolumeClaim",
      category: "storage",
      name,
      namespace,
      status: pvc.status?.phase ?? "Unknown",
      labels: labelsAsList(pvc.metadata?.labels),
      issueCount: pvcIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: pvcIssues,
      suggestedCommands: [`kubectl describe pvc ${name} -n ${namespace}`],
      relations: [],
      insights: [`StorageClass: ${pvc.spec?.storageClassName ?? "default"}.`],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addConfigMapResources(context: ResourceBuildContext, configMaps: V1ConfigMap[], issues: Issue[]) {
  for (const configMap of configMaps) {
    const namespace = configMap.metadata?.namespace ?? "default";
    const name = configMap.metadata?.name ?? "unknown";
    const key = resourceKey("ConfigMap", name, namespace);
    const configIssues = issues.filter((issue) => matchesIssue(issue, "ConfigMap", name, namespace));
    const summary: ResourceSummary = {
      key,
      kind: "ConfigMap",
      category: "configuration",
      name,
      namespace,
      status: Object.keys(configMap.data ?? {}).length > 0 ? "Configured" : "Empty",
      labels: labelsAsList(configMap.metadata?.labels),
      issueCount: configIssues.length,
      relationCount: 0
    };
    context.resources.set(key, summary);
    context.details.set(key, {
      ...summary,
      issues: configIssues,
      suggestedCommands: [`kubectl describe configmap ${name} -n ${namespace}`],
      relations: [],
      insights: [`${Object.keys(configMap.data ?? {}).length} configuration entries.`],
      references: [],
      history: []
    });
    addRelation(context, key, resourceKey("Namespace", namespace), "belongs-to", "scope");
  }
}

function addWorkloadRelations<T extends Workload>(
  context: ResourceBuildContext,
  workloads: T[],
  kind: "Deployment" | "StatefulSet" | "DaemonSet"
) {
  for (const workload of workloads) {
    const namespace = workload.metadata?.namespace ?? "default";
    const name = workload.metadata?.name ?? "unknown";
    const fromKey = resourceKey(kind, name, namespace);

    for (const reference of extractReferences(workload.spec?.template?.spec, namespace)) {
      ensureReferenceResource(context, reference, namespace);
      addRelation(
        context,
        fromKey,
        resourceKey(reference.kind, reference.name, reference.namespace ?? namespace),
        relationTypeForReference(reference.kind),
        `references ${reference.kind.toLowerCase()}`
      );
    }
  }
}

function addJobRelations(context: ResourceBuildContext, jobs: V1Job[], cronJobs: V1CronJob[]) {
  for (const job of jobs) {
    const namespace = job.metadata?.namespace ?? "default";
    const name = job.metadata?.name ?? "unknown";
    const fromKey = resourceKey("Job", name, namespace);

    for (const reference of extractReferences(job.spec?.template.spec, namespace)) {
      ensureReferenceResource(context, reference, namespace);
      addRelation(
        context,
        fromKey,
        resourceKey(reference.kind, reference.name, reference.namespace ?? namespace),
        relationTypeForReference(reference.kind),
        `references ${reference.kind.toLowerCase()}`
      );
    }

    const owner = job.metadata?.ownerReferences?.find((item) => item.kind === "CronJob");
    if (owner) {
      addRelation(context, resourceKey("CronJob", owner.name, namespace), fromKey, "owns", "owns job");
    }
  }

  for (const cronJob of cronJobs) {
    const namespace = cronJob.metadata?.namespace ?? "default";
    const name = cronJob.metadata?.name ?? "unknown";
    const fromKey = resourceKey("CronJob", name, namespace);

    for (const reference of extractReferences(cronJob.spec?.jobTemplate.spec?.template.spec, namespace)) {
      ensureReferenceResource(context, reference, namespace);
      addRelation(
        context,
        fromKey,
        resourceKey(reference.kind, reference.name, reference.namespace ?? namespace),
        relationTypeForReference(reference.kind),
        `references ${reference.kind.toLowerCase()}`
      );
    }
  }
}

function addReplicaSetRelations(context: ResourceBuildContext, replicaSets: V1ReplicaSet[], pods: V1Pod[]) {
  for (const replicaSet of replicaSets) {
    const namespace = replicaSet.metadata?.namespace ?? "default";
    const name = replicaSet.metadata?.name ?? "unknown";
    const replicaSetKey = resourceKey("ReplicaSet", name, namespace);
    const owner = replicaSet.metadata?.ownerReferences?.find((reference) => reference.kind === "Deployment");
    if (owner) {
      addRelation(context, resourceKey("Deployment", owner.name, namespace), replicaSetKey, "owns", "owns replica set");
    }

    for (const pod of pods) {
      if ((pod.metadata?.namespace ?? "default") !== namespace) {
        continue;
      }
      const podOwner = pod.metadata?.ownerReferences?.find(
        (reference: { kind?: string; name?: string }) => reference.kind === "ReplicaSet" && reference.name === name
      );
      if (podOwner) {
        addRelation(context, replicaSetKey, resourceKey("Pod", pod.metadata?.name ?? "unknown", namespace), "owns", "owns pod");
      }
    }
  }
}

function addHorizontalPodAutoscalerRelations(
  context: ResourceBuildContext,
  horizontalPodAutoscalers: V2HorizontalPodAutoscaler[]
) {
  for (const hpa of horizontalPodAutoscalers) {
    const namespace = hpa.metadata?.namespace ?? "default";
    const name = hpa.metadata?.name ?? "unknown";
    const targetKind = hpa.spec?.scaleTargetRef.kind as ResourceKind | undefined;
    const targetName = hpa.spec?.scaleTargetRef.name;
    if (!targetKind || !targetName) {
      continue;
    }

    addRelation(
      context,
      resourceKey("HorizontalPodAutoscaler", name, namespace),
      resourceKey(targetKind, targetName, namespace),
      "scales",
      "scales target"
    );
  }
}

function addServiceRelations(
  context: ResourceBuildContext,
  services: V1Service[],
  workloads: Array<{ kind: "Deployment" | "ReplicaSet" | "StatefulSet" | "DaemonSet"; resource: SelectorWorkload }>
) {
  for (const service of services) {
    const namespace = service.metadata?.namespace ?? "default";
    const serviceName = service.metadata?.name ?? "unknown";
    const serviceKey = resourceKey("Service", serviceName, namespace);
    const selector = service.spec?.selector;
    if (!selector || Object.keys(selector).length === 0) {
      continue;
    }

    for (const workload of workloads) {
      const workloadNamespace = workload.resource.metadata?.namespace ?? "default";
      if (workloadNamespace !== namespace) {
        continue;
      }

      const labels = workload.resource.spec?.template?.metadata?.labels;
      if (!selectorMatches(selector, labels)) {
        continue;
      }

      addRelation(
        context,
        resourceKey(workload.kind, workload.resource.metadata?.name ?? "unknown", namespace),
        serviceKey,
        "exposes",
        "selected by service"
      );
    }
  }
}

function addEndpointSliceRelations(context: ResourceBuildContext, endpointSlices: V1EndpointSlice[]) {
  for (const endpointSlice of endpointSlices) {
    const namespace = endpointSlice.metadata?.namespace ?? "default";
    const name = endpointSlice.metadata?.name ?? "unknown";
    const endpointSliceKey = resourceKey("EndpointSlice", name, namespace);
    const serviceName = endpointSlice.metadata?.labels?.["kubernetes.io/service-name"];

    if (serviceName) {
      addRelation(
        context,
        resourceKey("Service", serviceName, namespace),
        endpointSliceKey,
        "backs",
        "backs service"
      );
    }

    for (const endpoint of endpointSlice.endpoints ?? []) {
      if (endpoint.targetRef?.kind === "Pod" && endpoint.targetRef.name) {
        addRelation(
          context,
          endpointSliceKey,
          resourceKey("Pod", endpoint.targetRef.name, endpoint.targetRef.namespace ?? namespace),
          "backs",
          "contains pod endpoint"
        );
      }
    }
  }
}

function addIngressRelations(context: ResourceBuildContext, ingresses: V1Ingress[], services: V1Service[]) {
  const servicesByName = new Set(services.map((service) => resourceKey("Service", service.metadata?.name ?? "unknown", service.metadata?.namespace ?? "default")));
  for (const ingress of ingresses) {
    const namespace = ingress.metadata?.namespace ?? "default";
    const name = ingress.metadata?.name ?? "unknown";
    const ingressKey = resourceKey("Ingress", name, namespace);
    const ingressClassName = ingress.spec?.ingressClassName ?? ingress.metadata?.annotations?.["kubernetes.io/ingress.class"];

    if (ingressClassName) {
      addRelation(context, ingressKey, resourceKey("IngressClass", ingressClassName), "targets", "uses ingress class");
    }

    for (const rule of ingress.spec?.rules ?? []) {
      for (const path of rule.http?.paths ?? []) {
        const serviceName = path.backend?.service?.name;
        if (!serviceName) {
          continue;
        }

        const serviceKey = resourceKey("Service", serviceName, namespace);
        if (!servicesByName.has(serviceKey)) {
          continue;
        }

        addRelation(
          context,
          serviceKey,
          ingressKey,
          "exposes",
          rule.host ? `routes ${rule.host}` : "routes traffic"
        );
      }
    }
  }
}

function addPodDisruptionBudgetRelations(
  context: ResourceBuildContext,
  podDisruptionBudgets: V1PodDisruptionBudget[],
  deployments: V1Deployment[],
  statefulSets: V1StatefulSet[]
) {
  for (const podDisruptionBudget of podDisruptionBudgets) {
    const namespace = podDisruptionBudget.metadata?.namespace ?? "default";
    const pdbKey = resourceKey("PodDisruptionBudget", podDisruptionBudget.metadata?.name ?? "unknown", namespace);
    const selector = podDisruptionBudget.spec?.selector?.matchLabels;
    if (!selector || Object.keys(selector).length === 0) {
      continue;
    }

    for (const deployment of deployments) {
      if ((deployment.metadata?.namespace ?? "default") !== namespace) {
        continue;
      }
      if (selectorMatches(selector, deployment.spec?.template.metadata?.labels)) {
        addRelation(context, pdbKey, resourceKey("Deployment", deployment.metadata?.name ?? "unknown", namespace), "protects", "protects rollout");
      }
    }

    for (const statefulSet of statefulSets) {
      if ((statefulSet.metadata?.namespace ?? "default") !== namespace) {
        continue;
      }
      if (selectorMatches(selector, statefulSet.spec?.template.metadata?.labels)) {
        addRelation(context, pdbKey, resourceKey("StatefulSet", statefulSet.metadata?.name ?? "unknown", namespace), "protects", "protects stateful workload");
      }
    }
  }
}

function addServiceAccountRelations(
  context: ResourceBuildContext,
  pods: V1Pod[],
  deployments: V1Deployment[],
  statefulSets: V1StatefulSet[],
  daemonSets: V1DaemonSet[],
  jobs: V1Job[],
  cronJobs: V1CronJob[]
) {
  for (const pod of pods) {
    const namespace = pod.metadata?.namespace ?? "default";
    const podKey = resourceKey("Pod", pod.metadata?.name ?? "unknown", namespace);
    addServiceAccountReferenceRelations(context, podKey, namespace, pod.spec?.serviceAccountName, pod.spec?.imagePullSecrets?.map((item) => item.name).filter(Boolean) as string[] | undefined);
  }

  for (const deployment of deployments) {
    const namespace = deployment.metadata?.namespace ?? "default";
    const key = resourceKey("Deployment", deployment.metadata?.name ?? "unknown", namespace);
    addServiceAccountReferenceRelations(context, key, namespace, deployment.spec?.template.spec?.serviceAccountName, deployment.spec?.template.spec?.imagePullSecrets?.map((item) => item.name).filter(Boolean) as string[] | undefined);
  }

  for (const statefulSet of statefulSets) {
    const namespace = statefulSet.metadata?.namespace ?? "default";
    const key = resourceKey("StatefulSet", statefulSet.metadata?.name ?? "unknown", namespace);
    addServiceAccountReferenceRelations(context, key, namespace, statefulSet.spec?.template.spec?.serviceAccountName, statefulSet.spec?.template.spec?.imagePullSecrets?.map((item) => item.name).filter(Boolean) as string[] | undefined);
  }

  for (const daemonSet of daemonSets) {
    const namespace = daemonSet.metadata?.namespace ?? "default";
    const key = resourceKey("DaemonSet", daemonSet.metadata?.name ?? "unknown", namespace);
    addServiceAccountReferenceRelations(context, key, namespace, daemonSet.spec?.template.spec?.serviceAccountName, daemonSet.spec?.template.spec?.imagePullSecrets?.map((item) => item.name).filter(Boolean) as string[] | undefined);
  }

  for (const job of jobs) {
    const namespace = job.metadata?.namespace ?? "default";
    const key = resourceKey("Job", job.metadata?.name ?? "unknown", namespace);
    addServiceAccountReferenceRelations(context, key, namespace, job.spec?.template.spec?.serviceAccountName, job.spec?.template.spec?.imagePullSecrets?.map((item) => item.name).filter(Boolean) as string[] | undefined);
  }

  for (const cronJob of cronJobs) {
    const namespace = cronJob.metadata?.namespace ?? "default";
    const key = resourceKey("CronJob", cronJob.metadata?.name ?? "unknown", namespace);
    addServiceAccountReferenceRelations(context, key, namespace, cronJob.spec?.jobTemplate.spec?.template.spec?.serviceAccountName, cronJob.spec?.jobTemplate.spec?.template.spec?.imagePullSecrets?.map((item) => item.name).filter(Boolean) as string[] | undefined);
  }
}

function addPodRelations(context: ResourceBuildContext, pods: V1Pod[]) {
  for (const pod of pods) {
    const namespace = pod.metadata?.namespace ?? "default";
    const name = pod.metadata?.name ?? "unknown";
    const podKey = resourceKey("Pod", name, namespace);

    for (const reference of extractReferences(pod.spec, namespace)) {
      ensureReferenceResource(context, reference, namespace);
      addRelation(
        context,
        podKey,
        resourceKey(reference.kind, reference.name, reference.namespace ?? namespace),
        relationTypeForReference(reference.kind),
        `references ${reference.kind.toLowerCase()}`
      );
    }
  }
}

function enrichWorkloadDetails(context: ResourceBuildContext, inventory: ClusterInventory, issues: Issue[]) {
  const workloadEntries: Array<{
    kind: "Deployment" | "StatefulSet" | "DaemonSet";
    workload: V1Deployment | V1StatefulSet | V1DaemonSet;
  }> = [
    ...inventory.deployments.map((workload) => ({ kind: "Deployment" as const, workload })),
    ...inventory.statefulSets.map((workload) => ({ kind: "StatefulSet" as const, workload })),
    ...inventory.daemonSets.map((workload) => ({ kind: "DaemonSet" as const, workload }))
  ];

  for (const entry of workloadEntries) {
    const namespace = entry.workload.metadata?.namespace ?? "default";
    const name = entry.workload.metadata?.name ?? "unknown";
    const detail = context.details.get(resourceKey(entry.kind, name, namespace));
    if (!detail) {
      continue;
    }

    const templateLabels = entry.workload.spec?.template.metadata?.labels;
    const workloadPods = inventory.pods.filter((pod) => {
      if ((pod.metadata?.namespace ?? "default") !== namespace) {
        return false;
      }
      const owner = getPodOwner(pod);
      return owner?.kind === entry.kind && owner.name === name;
    });
    const matchingServices = inventory.services.filter((service) => {
      if ((service.metadata?.namespace ?? "default") !== namespace) {
        return false;
      }
      return selectorMatches(service.spec?.selector, templateLabels);
    });
    const matchingServiceNames = new Set(matchingServices.map((service) => service.metadata?.name ?? "unknown"));
    const matchingEndpointSlices = inventory.endpointSlices.filter((slice) => {
      if ((slice.metadata?.namespace ?? "default") !== namespace) {
        return false;
      }
      const serviceName = slice.metadata?.labels?.["kubernetes.io/service-name"];
      return serviceName ? matchingServiceNames.has(serviceName) : false;
    });
    const matchingIngresses = inventory.ingresses.filter((ingress) =>
      (ingress.spec?.rules ?? []).some((rule) =>
        (rule.http?.paths ?? []).some((path) => {
          const serviceName = path.backend?.service?.name;
          return serviceName ? matchingServiceNames.has(serviceName) : false;
        })
      )
    );
    const matchingHpas = inventory.horizontalPodAutoscalers.filter((hpa) => {
      if ((hpa.metadata?.namespace ?? "default") !== namespace) {
        return false;
      }
      return hpa.spec?.scaleTargetRef.kind === entry.kind && hpa.spec.scaleTargetRef.name === name;
    });
    const matchingPdbs = inventory.podDisruptionBudgets.filter((pdb) =>
      (pdb.metadata?.namespace ?? "default") === namespace &&
      selectorMatches(pdb.spec?.selector?.matchLabels, templateLabels)
    );
    const directEvents = collectRelevantEvents(inventory.events, entry.kind, namespace, name);
    const spec = entry.workload.spec?.template.spec;

    detail.rollout = {
      desiredReplicas: desiredReplicas(entry.workload),
      readyReplicas: readyReplicas(entry.workload),
      updatedReplicas: getUpdatedReplicas(entry.workload),
      availableReplicas: getAvailableReplicas(entry.workload),
      unavailableReplicas: getUnavailableReplicas(entry.workload),
      paused: entry.kind === "Deployment" ? Boolean((entry.workload as V1Deployment).spec?.paused) : false,
      progressing: hasPositiveCondition(entry.workload.status?.conditions, "Progressing"),
      currentRevision: entry.workload.metadata?.annotations?.["deployment.kubernetes.io/revision"],
      updatedRevision: findUpdatedRevision(inventory.replicaSets, namespace, name),
      conditions: (entry.workload.status?.conditions ?? []).map((condition) => ({
        type: condition.type,
        status: condition.status,
        reason: condition.reason,
        message: condition.message
      })),
      events: directEvents
    };

    const hpa = matchingHpas[0];
    detail.autoscaling = {
      enabled: Boolean(hpa),
      sourceKind: hpa ? "HorizontalPodAutoscaler" : undefined,
      name: hpa?.metadata?.name,
      namespace: hpa?.metadata?.namespace ?? namespace,
      minReplicas: hpa?.spec?.minReplicas,
      maxReplicas: hpa?.spec?.maxReplicas,
      currentReplicas: hpa?.status?.currentReplicas,
      desiredReplicas: hpa?.status?.desiredReplicas,
      targetKind: hpa?.spec?.scaleTargetRef.kind,
      targetName: hpa?.spec?.scaleTargetRef.name,
      cpuTargetUtilization: getMetricTarget(hpa, "cpu"),
      currentCpuUtilization: getMetricCurrentUtilization(hpa, "cpu"),
      memoryTargetUtilization: getMetricTarget(hpa, "memory"),
      currentMemoryUtilization: getMetricCurrentUtilization(hpa, "memory"),
      atMaxReplicas: Boolean(hpa && hpa.status?.desiredReplicas !== undefined && hpa.spec?.maxReplicas !== undefined && hpa.status.desiredReplicas >= hpa.spec.maxReplicas),
      conditions: (hpa?.status?.conditions ?? []).map((condition) => ({
        type: condition.type,
        status: condition.status,
        reason: condition.reason,
        message: condition.message
      }))
    };

    detail.exposure = {
      services: matchingServices.map((service) => {
        const serviceName = service.metadata?.name ?? "unknown";
        const slices = matchingEndpointSlices.filter(
          (slice) => slice.metadata?.labels?.["kubernetes.io/service-name"] === serviceName
        );
        return {
          name: serviceName,
          namespace,
          type: service.spec?.type,
          ports: (service.spec?.ports ?? []).map((port) => `${port.port}/${port.protocol ?? "TCP"}`),
          selector: renderSelector(service.spec?.selector),
          readyEndpoints: slices.reduce(
            (total, slice) =>
              total + (slice.endpoints ?? []).filter((endpoint) => endpoint.conditions?.ready !== false).length,
            0
          ),
          totalEndpoints: slices.reduce((total, slice) => total + (slice.endpoints?.length ?? 0), 0),
          endpointSlices: slices.map((slice) => ({
            name: slice.metadata?.name ?? "unknown",
            readyEndpoints: (slice.endpoints ?? []).filter((endpoint) => endpoint.conditions?.ready !== false).length,
            totalEndpoints: slice.endpoints?.length ?? 0,
            backingPods: (slice.endpoints ?? [])
              .flatMap((endpoint) =>
                endpoint.targetRef?.kind === "Pod" && endpoint.targetRef.name ? [endpoint.targetRef.name] : []
              )
              .sort()
          }))
        };
      }),
      ingresses: matchingIngresses.map((ingress) => ({
        name: ingress.metadata?.name ?? "unknown",
        namespace,
        ingressClassName: ingress.spec?.ingressClassName ?? ingress.metadata?.annotations?.["kubernetes.io/ingress.class"],
        hosts: (ingress.spec?.rules ?? []).map((rule) => rule.host).filter(Boolean) as string[],
        tlsSecrets: (ingress.spec?.tls ?? []).flatMap((tls) => tls.secretName ? [tls.secretName] : []),
        backendServices: (ingress.spec?.rules ?? []).flatMap((rule) =>
          (rule.http?.paths ?? []).flatMap((path) => path.backend?.service?.name ? [path.backend.service.name] : [])
        ),
        defaultBackendService: ingress.spec?.defaultBackend?.service?.name
      }))
    };

    detail.scheduling = {
      serviceAccountName: spec?.serviceAccountName,
      imagePullSecrets: (spec?.imagePullSecrets ?? []).map((item) => item.name).filter(Boolean) as string[],
      nodeSelector: labelsAsList(spec?.nodeSelector),
      tolerations: (spec?.tolerations ?? []).map((toleration) => `${toleration.key ?? "any"}=${toleration.value ?? ""}:${toleration.effect ?? "Any"}`),
      affinitySummary: summarizeAffinity(spec),
      topologySpread: (spec?.topologySpreadConstraints ?? []).map(
        (constraint) => `${constraint.topologyKey}:${constraint.whenUnsatisfiable}`
      )
    };

    detail.resilience = {
      hasReadinessProbe: hasAnyProbe(spec, "readinessProbe"),
      hasLivenessProbe: hasAnyProbe(spec, "livenessProbe"),
      hasStartupProbe: hasAnyProbe(spec, "startupProbe"),
      podDisruptionBudgets: matchingPdbs.map((pdb) => ({
        name: pdb.metadata?.name ?? "unknown",
        namespace,
        minAvailable: pdb.spec?.minAvailable?.toString(),
        maxUnavailable: pdb.spec?.maxUnavailable?.toString(),
        disruptionsAllowed: pdb.status?.disruptionsAllowed
      })),
      hasPodDisruptionBudget: matchingPdbs.length > 0,
      hasAntiAffinity: Boolean(spec?.affinity?.podAntiAffinity),
      risks: buildResilienceRisks(entry.kind, entry.workload, matchingPdbs, spec)
    };

    detail.cleanupSignals = buildCleanupSignals(entry.kind, entry.workload, matchingServices, matchingEndpointSlices, inventory.replicaSets);
    detail.events = directEvents;
    detail.insights = [
      ...detail.insights,
      `${workloadPods.length} pods gerados para este workload.`,
      matchingServices.length > 0 ? `${matchingServices.length} service(s) vinculados.` : "Sem service associado por selector.",
      matchingHpas.length > 0 ? `Escalado por ${matchingHpas.map((item) => item.metadata?.name ?? "unknown").join(", ")}.` : "Sem HPA associado."
    ];
  }
}

function buildNamespaceInventories(
  resources: ResourceSummary[],
  namespaceHealth: NamespaceHealth[],
  issues: Issue[]
): NamespaceInventory[] {
  return namespaceHealth
    .map((health) => {
      const resourcesInNamespace = resources.filter(
        (resource) => resource.namespace === health.name && resource.kind !== "Secret"
      );
      const resourceCounts = resourcesInNamespace.reduce<NamespaceInventory["resourceCounts"]>((counts, resource) => {
        counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
        return counts;
      }, {});

      return {
        name: health.name,
        health,
        resourceCounts,
        resources: resourcesInNamespace,
        topIssues: issues.filter((issue) => issue.resourceRef?.namespace === health.name).slice(0, 8)
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildOverview(
  inventory: ClusterInventory,
  namespaces: NamespaceHealth[],
  pods: PodHealth[],
  issues: Issue[],
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
  const allocatableStorage = parseMemory(node.status?.allocatable?.["ephemeral-storage"]?.toString());
  const cpuUsage = metrics.nodeCpu[name];
  const memoryUsage = metrics.nodeMemory[name];
  const storageUsage = metrics.nodeStorage[name];
  const nodePods = pods.filter((pod) => pod.spec?.nodeName === name);

  const workloads = Array.from(
    new Map(
      nodePods
        .map((pod) => workloadUsageKeyForPod(pod))
        .filter((value): value is string => Boolean(value))
        .map((key) => [key, workloadUsage.get(key)])
        .filter((entry): entry is [string, WorkloadSummary] => Boolean(entry[1]))
    ).values()
  )
    .sort((left, right) => (right.cpuCores ?? 0) - (left.cpuCores ?? 0))
  const topWorkloads = workloads.slice(0, 3);

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
    capacity: {
      cpu: {
        total: allocatableCpu,
        used: cpuUsage,
        available:
          allocatableCpu !== undefined && cpuUsage !== undefined
            ? Math.max(allocatableCpu - cpuUsage, 0)
            : undefined
      },
      memory: {
        total: allocatableMemory,
        used: memoryUsage,
        available:
          allocatableMemory !== undefined && memoryUsage !== undefined
            ? Math.max(allocatableMemory - memoryUsage, 0)
            : undefined
      },
      storage: {
        total: allocatableStorage,
        used: storageUsage,
        available:
          allocatableStorage !== undefined && storageUsage !== undefined
            ? Math.max(allocatableStorage - storageUsage, 0)
            : undefined
      }
    },
    pressure: (node.status?.conditions ?? [])
      .filter((condition) => condition.status === "True" && condition.type !== "Ready")
      .map((condition) => condition.type),
    podCount: nodePods.length,
    topWorkloads,
    workloads
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

function buildWorkloadUsage(pods: V1Pod[], metrics: PrometheusMetrics, podHealth: PodHealth[]): Map<string, WorkloadSummary> {
  const map = new Map<string, WorkloadSummary>();

  for (const pod of pods) {
    const owner = getPodOwner(pod);
    const namespace = pod.metadata?.namespace ?? "default";
    const key = workloadUsageKey(owner?.kind, owner?.name ?? pod.metadata?.name ?? "pod", namespace);
    const podKey = `${namespace}/${pod.metadata?.name ?? "unknown"}`;
    const podSummary = podHealth.find(
      (item) => item.namespace === namespace && item.name === (pod.metadata?.name ?? "unknown")
    );
    const current = map.get(key) ?? {
      kind: owner?.kind ?? "Pod",
      name: owner?.name ?? pod.metadata?.name ?? "unknown",
      namespace,
      key,
      replicas: 0,
      readyReplicas: 0,
      cpuCores: 0,
      memoryBytes: 0,
      restartCount: 0,
      issueCount: 0
    };

    current.replicas = (current.replicas ?? 0) + 1;
    if ((pod.status?.containerStatuses ?? []).every((status) => status.ready)) {
      current.readyReplicas = (current.readyReplicas ?? 0) + 1;
    }
    current.cpuCores = (current.cpuCores ?? 0) + (metrics.podCpu[podKey] ?? 0);
    current.memoryBytes = (current.memoryBytes ?? 0) + (metrics.podMemory[podKey] ?? 0);
    current.restartCount = (current.restartCount ?? 0) + (podSummary?.restarts ?? 0);

    map.set(key, current);
  }

  return map;
}

function enrichNodeWorkloads(nodes: NodeHealth[], issues: Issue[]): NodeHealth[] {
  return nodes.map((node) => ({
    ...node,
    workloads: node.workloads.map((workload) => ({
      ...workload,
      issueCount: issues.filter(
        (issue) =>
          issue.resourceRef?.namespace === workload.namespace &&
          issue.resourceRef?.name === workload.name &&
          issue.resourceRef?.kind === workload.kind
      ).length
    })),
    topWorkloads: node.topWorkloads.map((workload) => ({
      ...workload,
      issueCount: issues.filter(
        (issue) =>
          issue.resourceRef?.namespace === workload.namespace &&
          issue.resourceRef?.name === workload.name &&
          issue.resourceRef?.kind === workload.kind
      ).length
    }))
  }));
}

function buildDeploymentInventories(
  inventory: ClusterInventory,
  context: ResourceBuildContext,
  issues: Issue[]
): DeploymentInventory[] {
  return inventory.deployments
    .map((deployment) => {
      const namespace = deployment.metadata?.namespace ?? "default";
      const name = deployment.metadata?.name ?? "unknown";
      const key = resourceKey("Deployment", name, namespace);
      const detail = context.details.get(key);
      const deploymentIssues = issues.filter((issue) => matchesIssue(issue, "Deployment", name, namespace));

      return {
        key,
        name,
        namespace,
        status: workloadStatus(deployment),
        health: toDeploymentHealth(deployment, deploymentIssues),
        desiredReplicas: deployment.spec?.replicas,
        readyReplicas: deployment.status?.readyReplicas,
        updatedReplicas: deployment.status?.updatedReplicas,
        availableReplicas: deployment.status?.availableReplicas,
        rolloutDegraded: hasDeploymentRolloutIssue(deployment),
        autoscaling: detail?.autoscaling,
        exposure: detail?.exposure,
        resilience: detail?.resilience,
        references: detail?.references ?? [],
        cleanupSignals: detail?.cleanupSignals ?? [],
        topIssues: deploymentIssues.slice(0, 4),
        suggestedCommands: detail?.suggestedCommands ?? [
          `kubectl describe deployment ${name} -n ${namespace}`
        ]
      } satisfies DeploymentInventory;
    })
    .sort((left, right) => left.namespace.localeCompare(right.namespace) || left.name.localeCompare(right.name));
}

function workloadUsageKey(kind: string | undefined, name: string, namespace: string) {
  return `${kind ?? "Pod"}:${namespace}/${name}`;
}

function workloadUsageKeyForPod(pod: V1Pod): string | undefined {
  const owner = getPodOwner(pod);
  const namespace = pod.metadata?.namespace ?? "default";
  return workloadUsageKey(owner?.kind, owner?.name ?? pod.metadata?.name ?? "unknown", namespace);
}

function resourceKey(kind: ResourceKind, name: string, namespace?: string): string {
  return namespace ? `${kind}:${namespace}/${name}` : `${kind}:${name}`;
}

function addRelation(
  context: ResourceBuildContext,
  fromKey: string,
  toKey: string,
  type: ResourceRelationType,
  label: string
) {
  const relationKey = `${fromKey}|${toKey}|${type}`;
  context.relations.set(relationKey, {
    fromKey,
    toKey,
    type,
    label
  });
}

function addServiceAccountReferenceRelations(
  context: ResourceBuildContext,
  fromKey: string,
  namespace: string,
  serviceAccountName?: string,
  imagePullSecrets?: string[]
) {
  if (serviceAccountName) {
    addRelation(
      context,
      fromKey,
      resourceKey("ServiceAccount", serviceAccountName, namespace),
      "uses-account",
      "uses service account"
    );
  }

  for (const imagePullSecret of imagePullSecrets ?? []) {
    const reference = {
      kind: "Secret" as const,
      name: imagePullSecret,
      namespace
    };
    ensureReferenceResource(context, reference, namespace);
    addRelation(
      context,
      fromKey,
      resourceKey("Secret", imagePullSecret, namespace),
      "references-secret",
      "uses image pull secret"
    );
  }
}

function ensureReferenceResource(context: ResourceBuildContext, reference: ReferenceTarget, namespace: string) {
  const resourceNamespace = reference.namespace ?? namespace;
  const key = resourceKey(reference.kind, reference.name, resourceNamespace);
  if (context.resources.has(key)) {
    return;
  }

  const category: ResourceCategory = reference.kind === "PersistentVolumeClaim" ? "storage" : "configuration";
  const summary: ResourceSummary = {
    key,
    kind: reference.kind,
    category,
    name: reference.name,
    namespace: resourceNamespace,
    status: "Referenced",
    labels: [],
    issueCount: 0,
    relationCount: 0
  };
  context.resources.set(key, summary);
  context.details.set(key, {
    ...summary,
    issues: [],
    suggestedCommands:
      reference.kind === "Secret"
        ? [`kubectl describe secret ${reference.name} -n ${resourceNamespace}`]
        : [`kubectl describe ${reference.kind.toLowerCase()} ${reference.name} -n ${resourceNamespace}`],
    relations: [],
    insights: [`Referenced by workload or pod in namespace ${resourceNamespace}.`],
    references: [],
    history: []
  });
  addRelation(context, key, resourceKey("Namespace", resourceNamespace), "belongs-to", "scope");
}

function matchesIssue(issue: Issue, kind: ResourceKind, name: string, namespace?: string): boolean {
  return (
    issue.resourceRef?.kind === kind &&
    issue.resourceRef.name === name &&
    (issue.resourceRef.namespace ?? undefined) === (namespace ?? undefined)
  );
}

function labelsAsList(labels?: Record<string, string>): string[] {
  return Object.entries(labels ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);
}

function desiredReplicas(workload: Workload): number | undefined {
  if (isDaemonSet(workload)) {
    return workload.status?.desiredNumberScheduled;
  }
  return workload.spec?.replicas ?? 1;
}

function readyReplicas(workload: Workload): number | undefined {
  if (isDaemonSet(workload)) {
    return workload.status?.numberReady;
  }
  return workload.status?.readyReplicas;
}

function workloadStatus(workload: Workload): string {
  const desired = desiredReplicas(workload) ?? 0;
  const ready = readyReplicas(workload) ?? 0;
  if (desired === 0) {
    return "ScaledToZero";
  }
  return ready >= desired ? "Healthy" : "Degraded";
}

function jobStatus(job: V1Job): string {
  if ((job.status?.failed ?? 0) > 0) {
    return "Failed";
  }
  if ((job.status?.succeeded ?? 0) > 0) {
    return "Completed";
  }
  if ((job.status?.active ?? 0) > 0) {
    return "Running";
  }
  return "Pending";
}

function renderSelector(selector?: Record<string, string>): string {
  const labels = labelsAsList(selector);
  return labels.length > 0 ? labels.join(", ") : "none";
}

function extractReferences(spec?: V1PodSpec, namespace?: string): ReferenceTarget[] {
  if (!spec) {
    return [];
  }

  const references = new Map<string, ReferenceTarget>();
  const addReference = (reference?: ReferenceTarget) => {
    if (!reference?.name) {
      return;
    }

    const resolvedNamespace = reference.namespace ?? namespace;
    const key = `${reference.kind}:${resolvedNamespace ?? ""}/${reference.name}`;
    references.set(key, {
      ...reference,
      namespace: resolvedNamespace
    });
  };

  collectContainerReferences(spec.containers ?? [], addReference);
  collectContainerReferences(spec.initContainers ?? [], addReference);

  for (const volume of spec.volumes ?? []) {
    if (volume.configMap?.name) {
      addReference({
        kind: "ConfigMap",
        name: volume.configMap.name
      });
    }
    if (volume.secret?.secretName) {
      addReference({
        kind: "Secret",
        name: volume.secret.secretName
      });
    }
    if (volume.persistentVolumeClaim?.claimName) {
      addReference({
        kind: "PersistentVolumeClaim",
        name: volume.persistentVolumeClaim.claimName
      });
    }
  }

  return Array.from(references.values()).sort((left, right) => {
    const leftKey = `${left.kind}:${left.namespace ?? ""}/${left.name}`;
    const rightKey = `${right.kind}:${right.namespace ?? ""}/${right.name}`;
    return leftKey.localeCompare(rightKey);
  });
}

function collectContainerReferences(
  containers: V1Container[],
  addReference: (reference?: ReferenceTarget) => void
) {
  for (const container of containers) {
    for (const envFrom of container.envFrom ?? []) {
      if (envFrom.configMapRef?.name) {
        addReference({
          kind: "ConfigMap",
          name: envFrom.configMapRef.name
        });
      }
      if (envFrom.secretRef?.name) {
        addReference({
          kind: "Secret",
          name: envFrom.secretRef.name
        });
      }
    }

    for (const env of container.env ?? []) {
      if (env.valueFrom?.configMapKeyRef?.name) {
        addReference({
          kind: "ConfigMap",
          name: env.valueFrom.configMapKeyRef.name
        });
      }
      if (env.valueFrom?.secretKeyRef?.name) {
        addReference({
          kind: "Secret",
          name: env.valueFrom.secretKeyRef.name
        });
      }
    }
  }
}

function relationTypeForReference(kind: ReferenceTarget["kind"]): ResourceRelationType {
  if (kind === "PersistentVolumeClaim") {
    return "mounts";
  }
  if (kind === "Secret") {
    return "references-secret";
  }
  return "references-config";
}

function selectorMatches(selector?: Record<string, string>, labels?: Record<string, string>): boolean {
  if (!selector || Object.keys(selector).length === 0) {
    return false;
  }
  if (!labels) {
    return false;
  }

  return Object.entries(selector).every(([key, value]) => labels[key] === value);
}

function sortResources(left: ResourceSummary, right: ResourceSummary): number {
  const leftScope = left.namespace ?? "";
  const rightScope = right.namespace ?? "";
  if (leftScope !== rightScope) {
    return leftScope.localeCompare(rightScope);
  }
  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }
  return left.name.localeCompare(right.name);
}

function buildWorkloadInsights(
  kind: "Deployment" | "StatefulSet" | "DaemonSet",
  workload: Workload,
  usage?: WorkloadSummary
): string[] {
  const insights = [`Replicas: ready ${readyReplicas(workload) ?? 0}/${desiredReplicas(workload) ?? 0}.`];

  if (usage?.cpuCores !== undefined) {
    insights.push(`Observed CPU: ${formatCpu(usage.cpuCores)}.`);
  }
  if (usage?.memoryBytes !== undefined) {
    insights.push(`Observed memory: ${formatMemory(usage.memoryBytes)}.`);
  }

  if (kind === "Deployment") {
    const containers = workload.spec?.template?.spec?.containers ?? [];
    const missingResources = containers.some((container) => {
      const requests = container.resources?.requests;
      const limits = container.resources?.limits;
      return !requests?.cpu || !requests.memory || !limits?.cpu || !limits.memory;
    });
    insights.push(
      missingResources
        ? "Some containers are missing requests or limits."
        : "Requests and limits are present for all containers."
    );
  }

  return insights;
}

function toDeploymentHealth(deployment: V1Deployment, issues: Issue[]) {
  if (hasDeploymentRolloutIssue(deployment) || issues.some((issue) => issue.severity === "critical" || issue.severity === "high")) {
    return "critical" as const;
  }
  if (issues.length > 0) {
    return "warning" as const;
  }
  if ((deployment.status?.readyReplicas ?? 0) >= (deployment.spec?.replicas ?? 1)) {
    return "healthy" as const;
  }
  return "unknown" as const;
}

function hasDeploymentRolloutIssue(deployment: V1Deployment) {
  const desiredReplicas = deployment.spec?.replicas ?? 1;
  const readyReplicas = deployment.status?.readyReplicas ?? 0;
  const unavailableReplicas = deployment.status?.unavailableReplicas ?? Math.max(desiredReplicas - readyReplicas, 0);
  const progressingCondition = deployment.status?.conditions?.find((condition) => condition.type === "Progressing");

  if (readyReplicas < desiredReplicas) {
    return true;
  }

  if (unavailableReplicas > 0) {
    return true;
  }

  if (
    progressingCondition?.status === "False" &&
    progressingCondition.reason === "ProgressDeadlineExceeded"
  ) {
    return true;
  }

  return false;
}

function getUpdatedReplicas(workload: V1Deployment | V1StatefulSet | V1DaemonSet) {
  return (workload.status as { updatedReplicas?: number } | undefined)?.updatedReplicas;
}

function getAvailableReplicas(workload: V1Deployment | V1StatefulSet | V1DaemonSet) {
  return (workload.status as { availableReplicas?: number } | undefined)?.availableReplicas;
}

function getUnavailableReplicas(workload: V1Deployment | V1StatefulSet | V1DaemonSet) {
  return (workload.status as { unavailableReplicas?: number } | undefined)?.unavailableReplicas;
}

function isDaemonSet(workload: Workload): workload is V1DaemonSet {
  return "numberReady" in (workload.status ?? {});
}

function collectRelevantEvents(
  events: Array<Record<string, unknown>>,
  kind: string,
  namespace: string,
  name: string
) {
  return events
    .filter((event) => {
      const involvedObject = event["involvedObject"] as Record<string, unknown> | undefined;
      return (
        involvedObject?.["kind"] === kind &&
        involvedObject?.["namespace"] === namespace &&
        involvedObject?.["name"] === name
      );
    })
    .slice(0, 6)
    .map((event) => ({
      type: String(event["type"] ?? "Normal"),
      reason: String(event["reason"] ?? "Unknown"),
      message: String(event["message"] ?? ""),
      count: typeof event["count"] === "number" ? event["count"] : undefined,
      lastSeen: String(event["lastTimestamp"] ?? event["eventTime"] ?? "")
    }));
}

function hasPositiveCondition(
  conditions: Array<{ type?: string; status?: string }> | undefined,
  type: string
) {
  return conditions?.some((condition) => condition.type === type && condition.status === "True") ?? false;
}

function findUpdatedRevision(replicaSets: V1ReplicaSet[], namespace: string, deploymentName: string) {
  return replicaSets
    .filter((replicaSet) => (replicaSet.metadata?.namespace ?? "default") === namespace)
    .filter((replicaSet) =>
      replicaSet.metadata?.ownerReferences?.some((reference) => reference.kind === "Deployment" && reference.name === deploymentName)
    )
    .map((replicaSet) => replicaSet.metadata?.annotations?.["deployment.kubernetes.io/revision"])
    .filter((revision): revision is string => Boolean(revision))
    .sort()
    .at(-1);
}

function getMetricTarget(hpa: V2HorizontalPodAutoscaler | undefined, resourceName: "cpu" | "memory") {
  const metric = hpa?.spec?.metrics?.find(
    (item) => item.type === "Resource" && item.resource?.name === resourceName && item.resource?.target?.averageUtilization !== undefined
  );
  return metric?.resource?.target?.averageUtilization;
}

function getMetricCurrentUtilization(hpa: V2HorizontalPodAutoscaler | undefined, resourceName: "cpu" | "memory") {
  const metric = hpa?.status?.currentMetrics?.find(
    (item) => item.type === "Resource" && item.resource?.name === resourceName && item.resource.current.averageUtilization !== undefined
  );
  return metric?.resource?.current.averageUtilization;
}

function summarizeAffinity(spec?: V1PodSpec) {
  const summary: string[] = [];
  if (spec?.affinity?.nodeAffinity) {
    summary.push("node affinity");
  }
  if (spec?.affinity?.podAffinity) {
    summary.push("pod affinity");
  }
  if (spec?.affinity?.podAntiAffinity) {
    summary.push("pod anti-affinity");
  }
  return summary;
}

function hasAnyProbe(spec: V1PodSpec | undefined, field: "readinessProbe" | "livenessProbe" | "startupProbe") {
  return (spec?.containers ?? []).some((container) => Boolean(container[field]));
}

function buildResilienceRisks(
  kind: "Deployment" | "StatefulSet" | "DaemonSet",
  workload: V1Deployment | V1StatefulSet | V1DaemonSet,
  podDisruptionBudgets: V1PodDisruptionBudget[],
  spec: V1PodSpec | undefined
) {
  const risks: string[] = [];

  if (!hasAnyProbe(spec, "readinessProbe")) {
    risks.push("Workload sem readiness probe.");
  }
  if (!hasAnyProbe(spec, "livenessProbe")) {
    risks.push("Workload sem liveness probe.");
  }
  if (kind !== "DaemonSet" && (desiredReplicas(workload) ?? 0) <= 1) {
    risks.push("Replica unica aumenta risco de indisponibilidade.");
  }
  if (kind === "Deployment" && (desiredReplicas(workload) ?? 0) <= 1 && podDisruptionBudgets.length === 0) {
    risks.push("Deployment com replica unica e sem PDB.");
  }
  if (!spec?.affinity?.podAntiAffinity && (desiredReplicas(workload) ?? 0) > 1) {
    risks.push("Sem anti-affinity para replicas do mesmo workload.");
  }

  return risks;
}

function buildCleanupSignals(
  kind: "Deployment" | "StatefulSet" | "DaemonSet",
  workload: V1Deployment | V1StatefulSet | V1DaemonSet,
  services: V1Service[],
  endpointSlices: V1EndpointSlice[],
  replicaSets: V1ReplicaSet[]
) {
  const signals: string[] = [];
  const namespace = workload.metadata?.namespace ?? "default";
  const name = workload.metadata?.name ?? "unknown";

  if (kind === "Deployment" && services.length === 0) {
    signals.push("Deployment sem Service associado pelo selector.");
  }

  for (const service of services) {
    const serviceName = service.metadata?.name ?? "unknown";
    const serviceSlices = endpointSlices.filter(
      (slice) =>
        (slice.metadata?.namespace ?? "default") === namespace &&
        slice.metadata?.labels?.["kubernetes.io/service-name"] === serviceName
    );
    const readyEndpoints = serviceSlices.reduce(
      (total, slice) => total + (slice.endpoints ?? []).filter((endpoint) => endpoint.conditions?.ready !== false).length,
      0
    );
    if (service.spec?.selector && readyEndpoints === 0) {
      signals.push(`Service ${serviceName} sem endpoints prontos.`);
    }
  }

  const staleReplicaSets = replicaSets.filter(
    (replicaSet) =>
      (replicaSet.metadata?.namespace ?? "default") === namespace &&
      replicaSet.metadata?.ownerReferences?.some((reference) => reference.kind === "Deployment" && reference.name === name) &&
      (replicaSet.spec?.replicas ?? 0) === 0
  );
  if (kind === "Deployment" && staleReplicaSets.length > 1) {
    signals.push(`${staleReplicaSets.length} ReplicaSets antigos acumulados fora do rollout atual.`);
  }

  return signals;
}
