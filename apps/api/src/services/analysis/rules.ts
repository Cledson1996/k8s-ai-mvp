import type {
  Issue,
  NamespaceHealth,
  NodeHealth,
  PodHealth,
  Severity,
  WorkloadSummary
} from "@k8s-ai-mvp/shared";
import type { V1Deployment, V1Pod } from "@kubernetes/client-node";
import type { K8sGptFinding } from "../../connectors/k8sgpt.js";
import { deploymentResourceSummary, getPodOwner, toResourceRef } from "../../lib/helpers.js";
import { formatCpu, formatMemory } from "../../lib/quantity.js";

export interface RuleContext {
  collectedAt: string;
  pods: PodHealth[];
  nodes: NodeHealth[];
  namespaces: NamespaceHealth[];
  deployments: V1Deployment[];
  rawPods: V1Pod[];
  workloadUsage: Map<string, WorkloadSummary>;
  k8sGptFindings: K8sGptFinding[];
}

function severityForRestartCount(restarts: number): Severity {
  if (restarts >= 15) {
    return "critical";
  }

  if (restarts >= 8) {
    return "high";
  }

  return "medium";
}

export function buildRuleIssues(context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  for (const pod of context.pods) {
    if (pod.phase === "Failed" || pod.phase === "Unknown" || !pod.ready || pod.restarts >= 5) {
      issues.push({
        id: `pod-${pod.namespace}-${pod.name}`,
        title: `Pod ${pod.namespace}/${pod.name} requer atenção`,
        severity: severityForRestartCount(pod.restarts),
        category: "reliability",
        source: "rule",
        resourceRef: toResourceRef("Pod", pod.name, pod.namespace, pod.nodeName),
        summary: `O pod está em fase ${pod.phase}, ready=${pod.ready}, com ${pod.restarts} reinícios.`,
        evidence: [
          { label: "Phase", value: pod.phase },
          { label: "Ready", value: String(pod.ready) },
          { label: "Restarts", value: String(pod.restarts) },
          { label: "Reason", value: pod.reason ?? "n/a" }
        ],
        recommendation: "Inspecione eventos, logs e probes; confirme se há pressão de recursos ou configuração inconsistente.",
        playbook: [
          {
            title: "Verificar eventos",
            detail: `Inspecione eventos recentes do pod ${pod.namespace}/${pod.name}.`
          },
          {
            title: "Checar logs",
            detail: "Valide falhas de inicialização, readiness/liveness e erros de aplicação."
          }
        ],
        suggestedCommands: [
          `kubectl describe pod ${pod.name} -n ${pod.namespace}`,
          `kubectl logs ${pod.name} -n ${pod.namespace} --previous`
        ],
        detectedAt: context.collectedAt
      });
    }
  }

  for (const node of context.nodes) {
    const cpuHot = (node.usage.cpuPercent ?? 0) >= 85;
    const memoryHot = (node.usage.memoryPercent ?? 0) >= 85;
    if (!node.pressure.length && !cpuHot && !memoryHot) {
      continue;
    }

    issues.push({
      id: `node-${node.name}`,
      title: `Node ${node.name} com pressão ou uso elevado`,
      severity: cpuHot || memoryHot ? "high" : "medium",
      category: "capacity",
      source: node.pressure.length ? "prometheus" : "rule",
      resourceRef: toResourceRef("Node", node.name, undefined, node.name),
      summary: `O node apresenta pressão (${node.pressure.join(", ") || "nenhuma"}) com CPU ${Math.round(node.usage.cpuPercent ?? 0)}% e memória ${Math.round(node.usage.memoryPercent ?? 0)}%.`,
      evidence: [
        { label: "CPU", value: `${Math.round(node.usage.cpuPercent ?? 0)}%` },
        { label: "Memory", value: `${Math.round(node.usage.memoryPercent ?? 0)}%` },
        { label: "Pressure", value: node.pressure.join(", ") || "none" }
      ],
      recommendation: "Avalie redistribuição de cargas, requests/limits e capacidade do node pool.",
      playbook: [
        {
          title: "Listar workloads mais pesados",
          detail: `Confira os workloads que mais consomem no node ${node.name}.`
        },
        {
          title: "Confirmar overcommit",
          detail: "Compare uso observado com requests declarados."
        }
      ],
      suggestedCommands: [
        `kubectl describe node ${node.name}`,
        `kubectl top pod -A --sort-by=cpu --no-headers`
      ],
      detectedAt: context.collectedAt
    });
  }

  for (const deployment of context.deployments) {
    const namespace = deployment.metadata?.namespace ?? "default";
    const name = deployment.metadata?.name ?? "unknown";
    const resourceSummary = deploymentResourceSummary(deployment);

    if (resourceSummary.missingResources) {
      issues.push({
        id: `deployment-missing-resources-${namespace}-${name}`,
        title: `Deployment ${namespace}/${name} sem requests/limits completos`,
        severity: "high",
        category: "configuration",
        source: "rule",
        resourceRef: toResourceRef("Deployment", name, namespace),
        summary: "Há containers sem requests/limits completos, reduzindo previsibilidade e dificultando capacity planning.",
        evidence: [
          { label: "CPU request", value: formatCpu(resourceSummary.cpuRequest) },
          { label: "Memory request", value: formatMemory(resourceSummary.memoryRequest) }
        ],
        recommendation: "Defina requests e limits para CPU e memória em todos os containers do deployment.",
        playbook: [
          {
            title: "Mapear containers sem recursos",
            detail: "Revise o manifesto do deployment e identifique os containers sem requests/limits."
          },
          {
            title: "Aplicar sizing inicial",
            detail: "Use o consumo atual como base e depois refine com histórico do Prometheus."
          }
        ],
        suggestedCommands: [
          `kubectl get deployment ${name} -n ${namespace} -o yaml`,
          `kubectl rollout restart deployment/${name} -n ${namespace}`
        ],
        detectedAt: context.collectedAt
      });
    }

    const workload = context.workloadUsage.get(`${namespace}/${name}`);
    if (
      workload &&
      resourceSummary.cpuRequest &&
      workload.cpuCores &&
      workload.cpuCores > resourceSummary.cpuRequest * 1.5
    ) {
      issues.push({
        id: `deployment-cpu-mismatch-${namespace}-${name}`,
        title: `Deployment ${namespace}/${name} usa CPU acima do request declarado`,
        severity: "medium",
        category: "capacity",
        source: "prometheus",
        resourceRef: toResourceRef("Deployment", name, namespace),
        summary: `Uso aproximado de ${formatCpu(workload.cpuCores)} versus request agregado de ${formatCpu(resourceSummary.cpuRequest)}.`,
        evidence: [
          { label: "Observed CPU", value: formatCpu(workload.cpuCores) },
          { label: "Requested CPU", value: formatCpu(resourceSummary.cpuRequest) }
        ],
        recommendation: "Ajuste requests de CPU para refletir o consumo real ou investigue bursts persistentes.",
        playbook: [
          {
            title: "Comparar uso e request",
            detail: "Valide se o consumo observado é consistente ao longo do dia."
          }
        ],
        suggestedCommands: [
          `kubectl get deployment ${name} -n ${namespace} -o yaml`
        ],
        detectedAt: context.collectedAt
      });
    }
  }

  for (const finding of context.k8sGptFindings) {
    issues.push({
      id: `k8sgpt-${finding.namespace ?? "cluster"}-${finding.kind ?? "resource"}-${finding.name}`,
      title: `K8sGPT detectou possível problema em ${finding.name}`,
      severity: "medium",
      category: "observability",
      source: "k8sgpt",
      resourceRef: finding.kind ? toResourceRef(finding.kind, finding.name, finding.namespace) : undefined,
      summary: finding.details ?? "K8sGPT retornou um alerta sem detalhes adicionais.",
      evidence: [
        { label: "Resource", value: finding.name },
        { label: "Kind", value: finding.kind ?? "n/a" }
      ],
      recommendation: "Revise a explicação do K8sGPT e confronte com eventos e métricas antes de agir.",
      playbook: [
        {
          title: "Correlacionar com eventos e métricas",
          detail: "Use a visão de métricas e eventos do recurso para confirmar o diagnóstico."
        }
      ],
      suggestedCommands: finding.namespace
        ? [`kubectl describe ${finding.kind?.toLowerCase() ?? "pod"} ${finding.name} -n ${finding.namespace}`]
        : [],
      detectedAt: context.collectedAt
    });
  }

  return issues.sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    default:
      return 1;
  }
}

export function workloadKeyForPod(pod: V1Pod): string | undefined {
  const owner = getPodOwner(pod);
  const namespace = pod.metadata?.namespace;
  if (!owner || !namespace) {
    return undefined;
  }

  return `${namespace}/${owner.name}`;
}
