import OpenAI from "openai";
import type {
  DeploymentAnalysisCategory,
  DeploymentAnalysisFinding,
  DeploymentAnalysisRelatedResource,
  DeploymentAnalysisResponse,
  DeploymentAnalysisRisk,
  DeploymentAnalysisScorecard,
  DeploymentImprovementSuggestion,
  DeploymentMetricsResponse,
  Issue,
  IssueEvidence,
  NodeMetricsResponse,
  ResourceDetail,
  ResourceKind,
  ResourceRef,
  SuggestedYamlPatch,
} from "@k8s-ai-mvp/shared";
import type { AppConfig } from "../../config.js";
import type { AnalysisService } from "../analysis/service.js";
import type {
  SnapshotRepository,
  StoredSnapshot,
} from "../snapshot/repository.js";

export interface DeploymentAnalysisService {
  getSavedDeploymentAnalysis(
    namespace: string,
    name: string,
  ): Promise<DeploymentAnalysisResponse | undefined>;
  analyzeDeployment(
    namespace: string,
    name: string,
  ): Promise<DeploymentAnalysisResponse | undefined>;
  clearDeploymentAnalysis(namespace: string, name: string): Promise<boolean>;
}

interface DeploymentAnalysisContext {
  deployment: NonNullable<StoredSnapshot["snapshot"]["deployments"]>[number];
  detail: ResourceDetail;
  stored: StoredSnapshot;
  deploymentMetrics?: DeploymentMetricsResponse;
  nodeMetrics: NodeMetricsResponse[];
  relatedResources: DeploymentAnalysisRelatedResource[];
  relatedIssues: Issue[];
  degradedSources: string[];
}

export class LiveDeploymentAnalysisService
  implements DeploymentAnalysisService
{
  private readonly client?: OpenAI;
  private readonly model?: string;

  constructor(
    config: AppConfig,
    private readonly analysisService: AnalysisService,
    private readonly repository: SnapshotRepository,
  ) {
    if (config.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      this.model = config.OPENAI_MODEL;
    }
  }

  async analyzeDeployment(
    namespace: string,
    name: string,
  ): Promise<DeploymentAnalysisResponse | undefined> {
    await this.analysisService.getLatestOrRun();
    const stored = this.repository.getLatest();
    if (!stored) {
      return undefined;
    }

    const deployment = (stored.snapshot.deployments ?? []).find(
      (item) => item.namespace === namespace && item.name === name,
    );
    if (!deployment) {
      return undefined;
    }

    const detail = stored.detailsByKey[deployment.key];
    if (!detail) {
      return undefined;
    }

    const relatedResources = collectRelatedResources(stored, deployment.key, detail);
    const relatedIssues = collectRelatedIssues(
      stored,
      deployment.key,
      relatedResources,
    );
    const nodeNames = relatedResources
      .filter((resource) => resource.kind === "Node")
      .map((resource) => resource.name);

    const [deploymentMetrics, nodeMetrics] = await Promise.all([
      this.analysisService
        .getDeploymentMetrics(namespace, name, "7d")
        .catch(() => undefined),
      Promise.all(
        nodeNames.map((nodeName) =>
          this.analysisService
            .getNodeMetrics(nodeName, "7d")
            .catch(() => undefined),
        ),
      ).then((items) =>
        items.filter((item): item is NodeMetricsResponse => Boolean(item)),
      ),
    ]);

    const degradedSources = Array.from(
      new Set([
        ...stored.snapshot.degradedSources,
        ...(deploymentMetrics?.degradedSources ?? []),
        ...nodeMetrics.flatMap((item) => item.degradedSources),
      ]),
    );

    const context: DeploymentAnalysisContext = {
      deployment,
      detail,
      stored,
      deploymentMetrics,
      nodeMetrics,
      relatedResources,
      relatedIssues,
      degradedSources,
    };

    const heuristic = buildHeuristicAnalysis(context);
    const usedSources = [
      "kubernetes snapshot",
      "resource yaml",
      "prometheus history",
      "cluster rules",
      "k8sgpt findings",
      this.client && this.model ? "openai" : "heuristic analysis",
    ];

    if (!this.client || !this.model) {
      const fallback = {
        ...heuristic,
        usedSources,
      };
      this.repository.saveDeploymentAnalysis(fallback);
      return fallback;
    }

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Você é um assistente de SRE e engenharia de plataforma. Analise apenas o contexto fornecido do deployment. Responda sempre em português do Brasil. Retorne JSON estrito com executiveSummary, overallRisk, scorecards, findings, improvements, reviewCommands e suggestedYamlPatches. Nunca sugira escrita automática no cluster. Todo YAML sugerido deve ser apenas para revisão manual.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(buildAiPromptPayload(context)),
              },
            ],
          },
        ],
      });

      const parsed = tryParseAnalysis(response.output_text ?? "");
      if (!parsed) {
        const fallback = {
          ...heuristic,
          usedSources,
        };
        this.repository.saveDeploymentAnalysis(fallback);
        return fallback;
      }

      const result = {
        deployment: heuristic.deployment,
        generatedAt: new Date().toISOString(),
        usedSources,
        degradedSources,
        executiveSummary:
          parsed.executiveSummary?.trim() || heuristic.executiveSummary,
        overallRisk: parsed.overallRisk ?? heuristic.overallRisk,
        scorecards:
          parsed.scorecards?.length > 0
            ? parsed.scorecards
            : heuristic.scorecards,
        findings:
          parsed.findings?.length > 0 ? parsed.findings : heuristic.findings,
        improvements:
          parsed.improvements?.length > 0
            ? parsed.improvements
            : heuristic.improvements,
        reviewCommands:
          parsed.reviewCommands?.length > 0
            ? uniqueStrings(parsed.reviewCommands)
            : heuristic.reviewCommands,
        suggestedYamlPatches:
          parsed.suggestedYamlPatches?.length > 0
            ? parsed.suggestedYamlPatches
            : heuristic.suggestedYamlPatches,
        relatedResources: heuristic.relatedResources,
      };
      this.repository.saveDeploymentAnalysis(result);
      return result;
    } catch {
      const fallback = {
        ...heuristic,
        usedSources,
      };
      this.repository.saveDeploymentAnalysis(fallback);
      return fallback;
    }
  }

  async getSavedDeploymentAnalysis(
    namespace: string,
    name: string,
  ): Promise<DeploymentAnalysisResponse | undefined> {
    await this.analysisService.getLatestOrRun();
    const stored = this.repository.getLatest();
    if (!stored) {
      return undefined;
    }
    const deployment = (stored.snapshot.deployments ?? []).find(
      (item) => item.namespace === namespace && item.name === name,
    );
    if (!deployment) {
      return undefined;
    }
    return this.repository.getDeploymentAnalysis(deployment.key);
  }

  async clearDeploymentAnalysis(
    namespace: string,
    name: string,
  ): Promise<boolean> {
    await this.analysisService.getLatestOrRun();
    const stored = this.repository.getLatest();
    if (!stored) {
      return false;
    }
    const deployment = (stored.snapshot.deployments ?? []).find(
      (item) => item.namespace === namespace && item.name === name,
    );
    if (!deployment) {
      return false;
    }
    this.repository.deleteDeploymentAnalysis(deployment.key);
    return true;
  }
}

function buildHeuristicAnalysis(
  context: DeploymentAnalysisContext,
): Omit<DeploymentAnalysisResponse, "usedSources"> {
  const generatedAt = new Date().toISOString();
  const findings = buildFindings(context);
  const improvements = buildImprovements(context, findings);
  const suggestedYamlPatches = buildSuggestedYamlPatches(context, findings);
  const reviewCommands = uniqueStrings([
    ...context.deployment.suggestedCommands,
    ...context.relatedIssues.flatMap((issue) => issue.suggestedCommands),
  ]).slice(0, 12);
  const overallRisk = deriveOverallRisk(findings);
  const scorecards = buildScorecards(context, findings);

  return {
    deployment: {
      key: context.deployment.key,
      name: context.deployment.name,
      namespace: context.deployment.namespace,
    },
    generatedAt,
    degradedSources: context.degradedSources,
    executiveSummary: buildExecutiveSummary(context, findings, improvements),
    overallRisk,
    scorecards,
    findings,
    improvements,
    reviewCommands,
    suggestedYamlPatches,
    relatedResources: context.relatedResources,
  };
}

function buildFindings(
  context: DeploymentAnalysisContext,
): DeploymentAnalysisFinding[] {
  const findings: DeploymentAnalysisFinding[] = [];
  const deploymentRef: ResourceRef = {
    kind: "Deployment",
    namespace: context.deployment.namespace,
    name: context.deployment.name,
  };
  const deploymentMetrics = context.deploymentMetrics?.summary;

  for (const issue of context.relatedIssues.slice(0, 12)) {
    findings.push({
      id: issue.id,
      category: mapIssueCategory(issue.category),
      severity: issue.severity,
      title: issue.title,
      resource: issue.resourceRef ?? deploymentRef,
      evidence: issue.evidence,
      impact: issue.summary,
      recommendation: issue.recommendation,
    });
  }

  if (!context.deployment.autoscaling?.enabled) {
    findings.push({
      id: `${context.deployment.key}-missing-hpa`,
      category: "autoscaling",
      severity:
        deploymentMetrics?.cpu.max && deploymentMetrics.cpu.max > 0.5
          ? "high"
          : "medium",
      title: "Deployment sem autoscaling horizontal",
      resource: deploymentRef,
      evidence: [
        metricEvidence(
          "CPU media 7d",
          context.deploymentMetrics?.summary.cpu.avg,
          "cpu",
        ),
        metricEvidence(
          "CPU pico 7d",
          context.deploymentMetrics?.summary.cpu.max,
          "cpu",
        ),
      ].filter(Boolean) as IssueEvidence[],
      impact:
        "Crescimento de carga pode exigir replicas manuais e aumentar o risco de indisponibilidade.",
      recommendation:
        "Avalie HPA com alvo de CPU e revise se os nodes atuais suportam o crescimento esperado.",
    });
  }

  if (
    !context.detail.resilience?.hasReadinessProbe ||
    !context.detail.resilience?.hasLivenessProbe
  ) {
    findings.push({
      id: `${context.deployment.key}-probe-gap`,
      category: "availability",
      severity: "high",
      title: "Workload sem probes completas",
      resource: deploymentRef,
      evidence: [
        {
          label: "Readiness probe",
          value: context.detail.resilience?.hasReadinessProbe
            ? "presente"
            : "ausente",
        },
        {
          label: "Liveness probe",
          value: context.detail.resilience?.hasLivenessProbe
            ? "presente"
            : "ausente",
        },
      ],
      impact:
        "Sem probes bem definidas, o rollout e a recuperação automática podem mascarar falhas ou manter pods indisponíveis em produção.",
      recommendation:
        "Defina readiness e liveness alinhadas com a porta e o tempo real de inicialização da aplicação.",
    });
  }

  if (
    (context.deployment.desiredReplicas ?? 0) > 1 &&
    !context.detail.resilience?.hasPodDisruptionBudget
  ) {
    findings.push({
      id: `${context.deployment.key}-missing-pdb`,
      category: "availability",
      severity: "medium",
      title: "Deployment sem PodDisruptionBudget",
      resource: deploymentRef,
      evidence: [
        {
          label: "Replicas desejadas",
          value: String(context.deployment.desiredReplicas ?? 0),
        },
      ],
      impact:
        "Evicções ou manutenções simultâneas podem reduzir a disponibilidade além do esperado.",
      recommendation:
        "Adicione PDB mínimo para proteger o serviço durante drenagens e upgrades de node.",
    });
  }

  for (const service of context.deployment.exposure?.services ?? []) {
    if ((service.totalEndpoints ?? 0) === 0 || (service.readyEndpoints ?? 0) === 0) {
      findings.push({
        id: `${context.deployment.key}-service-${service.name}-no-endpoints`,
        category: "networking",
        severity: "high",
        title: `Service ${service.name} sem endpoints prontos`,
        resource: {
          kind: "Service",
          namespace: service.namespace,
          name: service.name,
        },
        evidence: [
          {
            label: "Endpoints prontos",
            value: `${service.readyEndpoints ?? 0}/${service.totalEndpoints ?? 0}`,
          },
        ],
        impact:
          "O tráfego pode chegar ao service ou ingress sem backend saudável disponível.",
        recommendation:
          "Revise selector, labels dos pods, readiness e endpoint slices associados.",
      });
    }
  }

  for (const ingress of context.deployment.exposure?.ingresses ?? []) {
    if (ingress.hosts.length > 0 && ingress.tlsSecrets.length === 0) {
      findings.push({
        id: `${context.deployment.key}-ingress-${ingress.name}-without-tls`,
        category: "security",
        severity: "medium",
        title: `Ingress ${ingress.name} sem TLS configurado`,
        resource: {
          kind: "Ingress",
          namespace: ingress.namespace,
          name: ingress.name,
        },
        evidence: [
          {
            label: "Hosts expostos",
            value: ingress.hosts.join(", "),
          },
        ],
        impact:
          "A exposição externa sem TLS aumenta risco de tráfego sem proteção e configuração inconsistente entre ambientes.",
        recommendation:
          "Associe um secret TLS e valide se o ingress class aplica terminação segura.",
      });
    }
  }

  if ((context.detail.scheduling?.serviceAccountName ?? "default") === "default") {
    findings.push({
      id: `${context.deployment.key}-default-serviceaccount`,
      category: "security",
      severity: "low",
      title: "Deployment usando service account default",
      resource: deploymentRef,
      evidence: [
        {
          label: "ServiceAccount",
          value: context.detail.scheduling?.serviceAccountName ?? "default",
        },
      ],
      impact:
        "Fica mais difícil isolar permissões e revisar o perfil de acesso do workload.",
      recommendation:
        "Considere service account dedicada quando o deployment falar com APIs internas ou componentes sensíveis.",
      });
  }

  const constrainedNodes = context.nodeMetrics.filter((nodeMetric) => {
    const node = context.stored.snapshot.nodes.find(
      (item) => item.name === nodeMetric.node.name,
    );
    if (!node) {
      return false;
    }
    const cpuPercent =
      node.capacity.cpu.total && nodeMetric.summary.cpu.max !== undefined
        ? (nodeMetric.summary.cpu.max / node.capacity.cpu.total) * 100
        : 0;
    const memoryPercent =
      node.capacity.memory.total && nodeMetric.summary.memory.max !== undefined
        ? (nodeMetric.summary.memory.max / node.capacity.memory.total) * 100
        : 0;
    return cpuPercent >= 80 || memoryPercent >= 85;
  });

  if (constrainedNodes.length > 0) {
    findings.push({
      id: `${context.deployment.key}-node-capacity-risk`,
      category: "capacity",
      severity: "high",
      title: "Nodes atuais com pouca folga histórica para crescimento",
      resource: deploymentRef,
      evidence: constrainedNodes.map((metric) => {
        const node = context.stored.snapshot.nodes.find(
          (item) => item.name === metric.node.name,
        );
        const cpuPercent =
          node?.capacity.cpu.total && metric.summary.cpu.max !== undefined
            ? `${Math.round((metric.summary.cpu.max / node.capacity.cpu.total) * 100)}% CPU pico`
            : "CPU indisponível";
        const memoryPercent =
          node?.capacity.memory.total && metric.summary.memory.max !== undefined
            ? `${Math.round((metric.summary.memory.max / node.capacity.memory.total) * 100)}% RAM pico`
            : "RAM indisponível";
        return {
          label: metric.node.name,
          value: `${cpuPercent} | ${memoryPercent}`,
        };
      }),
      impact:
        "Se o deployment precisar crescer, os nodes que já hospedam os pods podem não ter folga suficiente.",
      recommendation:
        "Revise requests/limits, HPA e restrições de agendamento para evitar crescimento preso a poucos nodes saturados.",
    });
  }

  return dedupeFindings(findings);
}

function buildImprovements(
  context: DeploymentAnalysisContext,
  findings: DeploymentAnalysisFinding[],
): DeploymentImprovementSuggestion[] {
  const improvements: DeploymentImprovementSuggestion[] = [];
  const deploymentRef: ResourceRef = {
    kind: "Deployment",
    namespace: context.deployment.namespace,
    name: context.deployment.name,
  };

  if (!context.deployment.autoscaling?.enabled) {
    improvements.push({
      id: `${context.deployment.key}-improve-hpa`,
      title: "Adicionar HPA com alvo conservador",
      priority: "medium",
      summary:
        "Criar autoscaling horizontal reduz risco de pico manual e ajuda a absorver crescimento sem depender de intervenção operacional.",
      resource: deploymentRef,
    });
  }

  if (
    !context.detail.resilience?.hasReadinessProbe ||
    !context.detail.resilience?.hasLivenessProbe
  ) {
    improvements.push({
      id: `${context.deployment.key}-improve-probes`,
      title: "Completar probes do workload",
      priority: "high",
      summary:
        "Readiness e liveness bem calibradas melhoram rollout, detecção de falha e estabilidade da cadeia service/endpoints.",
      resource: deploymentRef,
    });
  }

  if (
    context.relatedIssues.some((issue) => issue.id.includes("missing-resources")) ||
    context.relatedIssues.some((issue) => issue.category === "capacity")
  ) {
    improvements.push({
      id: `${context.deployment.key}-improve-resources`,
      title: "Revisar requests e limits com base no histórico",
      priority: "high",
      summary:
        "Use média e pico de CPU/RAM para ajustar recursos do container e evitar tanto desperdício quanto throttling ou OOM em crescimento.",
      resource: deploymentRef,
    });
  }

  if (
    (context.deployment.desiredReplicas ?? 0) > 1 &&
    !context.detail.resilience?.hasPodDisruptionBudget
  ) {
    improvements.push({
      id: `${context.deployment.key}-improve-pdb`,
      title: "Adicionar PodDisruptionBudget",
      priority: "medium",
      summary:
        "Protege o deployment em drenagem de node, upgrades e interrupções voluntárias de infraestrutura.",
      resource: deploymentRef,
    });
  }

  if (
    findings.some((finding) => finding.category === "networking") &&
    context.deployment.exposure?.services?.length
  ) {
    improvements.push({
      id: `${context.deployment.key}-improve-network`,
      title: "Revisar selectors, readiness e backend exposto",
      priority: "high",
      summary:
        "A cadeia service -> endpoint slice -> pod precisa estar consistente para o ingress ou o tráfego interno não apontarem para backends vazios.",
      resource: deploymentRef,
    });
  }

  if ((context.detail.scheduling?.serviceAccountName ?? "default") === "default") {
    improvements.push({
      id: `${context.deployment.key}-improve-identity`,
      title: "Avaliar service account dedicada",
      priority: "low",
      summary:
        "Ajuda a separar permissões e deixar a identidade do workload mais auditável.",
      resource: deploymentRef,
    });
  }

  return improvements.slice(0, 8);
}

function buildSuggestedYamlPatches(
  context: DeploymentAnalysisContext,
  findings: DeploymentAnalysisFinding[],
): SuggestedYamlPatch[] {
  const patches: SuggestedYamlPatch[] = [];
  const deployment = context.deployment;
  const containerName = extractFirstContainerName(context.detail.manifestYaml) ?? "app";

  if (!deployment.autoscaling?.enabled) {
    patches.push({
      resource: {
        kind: "HorizontalPodAutoscaler",
        namespace: deployment.namespace,
        name: `${deployment.name}-hpa`,
      },
      reason: "Autoscaling horizontal ainda nao configurado.",
      note: "Sugestao para revisao manual antes de aplicar.",
      yaml: [
        "apiVersion: autoscaling/v2",
        "kind: HorizontalPodAutoscaler",
        "metadata:",
        `  name: ${deployment.name}-hpa`,
        `  namespace: ${deployment.namespace}`,
        "spec:",
        "  scaleTargetRef:",
        "    apiVersion: apps/v1",
        "    kind: Deployment",
        `    name: ${deployment.name}`,
        `  minReplicas: ${Math.max(1, Math.min(deployment.readyReplicas ?? 1, 2))}`,
        `  maxReplicas: ${Math.max((deployment.desiredReplicas ?? 1) * 3, 4)}`,
        "  metrics:",
        "    - type: Resource",
        "      resource:",
        "        name: cpu",
        "        target:",
        "          type: Utilization",
        "          averageUtilization: 70",
      ].join("\n"),
    });
  }

  if (
    (deployment.desiredReplicas ?? 0) > 1 &&
    !context.detail.resilience?.hasPodDisruptionBudget
  ) {
    patches.push({
      resource: {
        kind: "PodDisruptionBudget",
        namespace: deployment.namespace,
        name: `${deployment.name}-pdb`,
      },
      reason: "Deployment com multiplas replicas sem PDB de protecao.",
      note: "Sugestao para revisao manual antes de aplicar.",
      yaml: [
        "apiVersion: policy/v1",
        "kind: PodDisruptionBudget",
        "metadata:",
        `  name: ${deployment.name}-pdb`,
        `  namespace: ${deployment.namespace}`,
        "spec:",
        "  minAvailable: 1",
        "  selector:",
        "    matchLabels:",
        `      app.kubernetes.io/name: ${deployment.name}`,
      ].join("\n"),
    });
  }

  if (findings.some((finding) => finding.id.includes("missing-resources"))) {
    const cpuRequest = recommendCpuRequest(context.deploymentMetrics?.summary.cpu.avg);
    const cpuLimit = recommendCpuLimit(
      context.deploymentMetrics?.summary.cpu.max,
      cpuRequest,
    );
    const memoryRequest = recommendMemoryRequest(
      context.deploymentMetrics?.summary.memory.avg,
    );
    const memoryLimit = recommendMemoryLimit(
      context.deploymentMetrics?.summary.memory.max,
      memoryRequest,
    );

    patches.push({
      resource: {
        kind: "Deployment",
        namespace: deployment.namespace,
        name: deployment.name,
      },
      reason: "Requests e limits parecem ausentes ou insuficientes frente ao historico observado.",
      note: "Trecho parcial para revisao manual; ajuste nomes de container e valores finais conforme a aplicacao.",
      yaml: [
        "apiVersion: apps/v1",
        "kind: Deployment",
        "metadata:",
        `  name: ${deployment.name}`,
        `  namespace: ${deployment.namespace}`,
        "spec:",
        "  template:",
        "    spec:",
        "      containers:",
        `        - name: ${containerName}`,
        "          resources:",
        "            requests:",
        `              cpu: \"${cpuRequest}\"`,
        `              memory: \"${memoryRequest}\"`,
        "            limits:",
        `              cpu: \"${cpuLimit}\"`,
        `              memory: \"${memoryLimit}\"`,
      ].join("\n"),
    });
  }

  return patches;
}

function buildScorecards(
  context: DeploymentAnalysisContext,
  findings: DeploymentAnalysisFinding[],
): DeploymentAnalysisScorecard[] {
  return [
    buildScorecard(
      "rollout",
      "Rollout",
      findings,
      context.detail.rollout?.events?.length
        ? `Eventos observados: ${context.detail.rollout.events.length}.`
        : "Sem eventos de rollout anexados nesta coleta.",
    ),
    buildScorecard(
      "autoscaling",
      "Escala",
      findings,
      context.deployment.autoscaling?.enabled
        ? `HPA ${context.deployment.autoscaling.name ?? "ativo"} com max ${context.deployment.autoscaling.maxReplicas ?? "--"}.`
        : "HPA nao configurado.",
    ),
    buildScorecard(
      "networking",
      "Rede",
      findings,
      `${context.deployment.exposure?.services?.length ?? 0} services e ${context.deployment.exposure?.ingresses?.length ?? 0} ingresses conectados.`,
    ),
    buildScorecard(
      "security",
      "Seguranca",
      findings,
      `ServiceAccount ${context.detail.scheduling?.serviceAccountName ?? "default"} e ${context.detail.scheduling?.imagePullSecrets.length ?? 0} imagePullSecrets.`,
    ),
    buildScorecard(
      "capacity",
      "Capacidade",
      findings,
      `CPU pico ${formatMetric(context.deploymentMetrics?.summary.cpu.max, "cpu")} e RAM pico ${formatMetric(context.deploymentMetrics?.summary.memory.max, "memory")}.`,
    ),
  ];
}

function buildExecutiveSummary(
  context: DeploymentAnalysisContext,
  findings: DeploymentAnalysisFinding[],
  improvements: DeploymentImprovementSuggestion[],
) {
  const topFindings = findings.slice(0, 3).map((finding) => finding.title);
  const relatedServices = context.deployment.exposure?.services.length ?? 0;
  const relatedIngresses = context.deployment.exposure?.ingresses.length ?? 0;

  if (topFindings.length === 0) {
    return `Deployment ${context.deployment.namespace}/${context.deployment.name} foi analisado com ${relatedServices} services, ${relatedIngresses} ingresses e sem achados prioritarios nesta coleta.`;
  }

  return `Deployment ${context.deployment.namespace}/${context.deployment.name} tem ${topFindings.length} frentes prioritarias: ${topFindings.join("; ")}. As melhorias mais relevantes agora sao ${improvements
    .slice(0, 2)
    .map((item) => item.title.toLowerCase())
    .join(" e ")}.`;
}

function deriveOverallRisk(
  findings: DeploymentAnalysisFinding[],
): DeploymentAnalysisRisk {
  if (
    findings.some(
      (finding) =>
        finding.severity === "critical" || finding.severity === "high",
    )
  ) {
    return "critical";
  }
  if (findings.length > 0) {
    return "warning";
  }
  return "healthy";
}

function buildScorecard(
  category: DeploymentAnalysisCategory,
  label: string,
  findings: DeploymentAnalysisFinding[],
  fallbackSummary: string,
): DeploymentAnalysisScorecard {
  const relevant = findings.filter((finding) => finding.category === category);
  const risk = deriveOverallRisk(relevant);
  return {
    category,
    label,
    risk,
    summary: relevant[0]?.recommendation ?? fallbackSummary,
  };
}

function collectRelatedResources(
  stored: StoredSnapshot,
  deploymentKey: string,
  detail: ResourceDetail,
): DeploymentAnalysisRelatedResource[] {
  const keys = new Set<string>([deploymentKey]);
  const relations = stored.snapshot.relations;

  const directKeys = relations
    .filter(
      (relation) =>
        relation.fromKey === deploymentKey || relation.toKey === deploymentKey,
    )
    .flatMap((relation) => [relation.fromKey, relation.toKey]);
  for (const key of directKeys) {
    keys.add(key);
  }

  for (const service of detail.exposure?.services ?? []) {
    const serviceKey = buildResourceKey("Service", service.name, service.namespace);
    keys.add(serviceKey);
    for (const relation of relations.filter((item) => item.fromKey === serviceKey || item.toKey === serviceKey)) {
      keys.add(relation.fromKey);
      keys.add(relation.toKey);
    }
  }

  for (const ingress of detail.exposure?.ingresses ?? []) {
    keys.add(buildResourceKey("Ingress", ingress.name, ingress.namespace));
  }

  if (detail.autoscaling?.name) {
    keys.add(
      buildResourceKey(
        "HorizontalPodAutoscaler",
        detail.autoscaling.name,
        detail.autoscaling.namespace ?? detail.namespace,
      ),
    );
  }

  for (const reference of detail.references ?? []) {
    keys.add(
      buildResourceKey(
        reference.kind,
        reference.name,
        reference.namespace ?? detail.namespace,
      ),
    );
  }

  if (detail.scheduling?.serviceAccountName) {
    keys.add(
      buildResourceKey(
        "ServiceAccount",
        detail.scheduling.serviceAccountName,
        detail.namespace,
      ),
    );
  }

  for (const imagePullSecret of detail.scheduling?.imagePullSecrets ?? []) {
    keys.add(buildResourceKey("Secret", imagePullSecret, detail.namespace));
  }

  for (const pdb of detail.resilience?.podDisruptionBudgets ?? []) {
    keys.add(
      buildResourceKey(
        "PodDisruptionBudget",
        pdb.name,
        pdb.namespace ?? detail.namespace,
      ),
    );
  }

  const podKeys = Array.from(keys).filter((key) => key.startsWith("Pod:"));
  for (const podKey of podKeys) {
    for (const relation of relations.filter((item) => item.fromKey === podKey || item.toKey === podKey)) {
      keys.add(relation.fromKey);
      keys.add(relation.toKey);
    }
  }

  return Array.from(keys)
    .map((key) => {
      const parsed = parseResourceKey(key);
      const resourceDetail = stored.detailsByKey[key];
      if (!parsed || !resourceDetail) {
        return undefined;
      }
      return {
        key,
        kind: parsed.kind,
        name: parsed.name,
        namespace: parsed.namespace,
        role: inferResourceRole(parsed.kind, key, deploymentKey, relations),
        status: resourceDetail.status,
        summary:
          resourceDetail.insights?.[0] ??
          resourceDetail.suggestedCommands?.[0] ??
          resourceDetail.status,
        manifestYaml: resourceDetail.manifestYaml,
      } satisfies DeploymentAnalysisRelatedResource;
    })
    .filter((resource) => resource !== undefined)
    .sort(
      (left, right) =>
        left.kind.localeCompare(right.kind) ||
        left.name.localeCompare(right.name),
    );
}

function collectRelatedIssues(
  stored: StoredSnapshot,
  deploymentKey: string,
  relatedResources: DeploymentAnalysisRelatedResource[],
) {
  const relatedKeys = new Set([
    deploymentKey,
    ...relatedResources.map((resource) => resource.key),
  ]);
  return stored.snapshot.issues.filter((issue) => {
    const ref = issue.resourceRef;
    if (!ref?.kind || !ref.name) {
      return false;
    }
    return relatedKeys.has(
      buildResourceKey(ref.kind as ResourceKind, ref.name, ref.namespace),
    );
  });
}

function buildAiPromptPayload(context: DeploymentAnalysisContext) {
  return {
    deployment: context.deployment,
    rollout: context.detail.rollout,
    autoscaling: context.detail.autoscaling,
    exposure: context.detail.exposure,
    scheduling: context.detail.scheduling,
    resilience: context.detail.resilience,
    cleanupSignals: context.detail.cleanupSignals,
    history: {
      deployment: summarizeMetricsForAi(context.deploymentMetrics),
      nodes: context.nodeMetrics.map((nodeMetric) =>
        summarizeNodeMetricsForAi(context, nodeMetric),
      ),
    },
    issues: context.relatedIssues.slice(0, 16).map((issue) => ({
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      category: issue.category,
      resourceRef: issue.resourceRef,
      summary: issue.summary,
      evidence: issue.evidence,
      recommendation: issue.recommendation,
    })),
    relatedResources: context.relatedResources.map((resource) => ({
      ...resource,
      manifestYaml: resource.manifestYaml,
    })),
    requiredOutputShape: {
      executiveSummary: "string",
      overallRisk: ["healthy", "warning", "critical"],
      scorecards: [
        {
          category:
            "rollout|availability|autoscaling|capacity|networking|configuration|security|cleanup",
          label: "string",
          risk: "healthy|warning|critical",
          summary: "string",
        },
      ],
      findings: [
        {
          id: "string",
          category:
            "rollout|availability|autoscaling|capacity|networking|configuration|security|cleanup",
          severity: "critical|high|medium|low|info",
          title: "string",
          resource: {
            kind: "string",
            namespace: "string?",
            name: "string",
          },
          evidence: [{ label: "string", value: "string" }],
          impact: "string",
          recommendation: "string",
        },
      ],
      improvements: [
        {
          id: "string",
          title: "string",
          priority: "critical|high|medium|low|info",
          summary: "string",
          resource: {
            kind: "string",
            namespace: "string?",
            name: "string",
          },
        },
      ],
      reviewCommands: ["string"],
      suggestedYamlPatches: [
        {
          resource: {
            kind: "string",
            namespace: "string?",
            name: "string",
          },
          reason: "string",
          yaml: "string",
          note: "string",
        },
      ],
    },
  };
}

function summarizeMetricsForAi(metrics?: DeploymentMetricsResponse) {
  if (!metrics) {
    return undefined;
  }

  return {
    window: metrics.window,
    cpu: metrics.summary.cpu,
    memory: metrics.summary.memory,
    recentCpuPoints: metrics.cpu.aggregate.points.slice(-8),
    recentMemoryPoints: metrics.memory.aggregate.points.slice(-8),
    podCpuSeries: metrics.cpu.pods.map((item) => ({
      label: item.label,
      latest: item.points[item.points.length - 1]?.value,
      max: maxPoint(item.points),
    })),
    podMemorySeries: metrics.memory.pods.map((item) => ({
      label: item.label,
      latest: item.points[item.points.length - 1]?.value,
      max: maxPoint(item.points),
    })),
  };
}

function summarizeNodeMetricsForAi(
  context: DeploymentAnalysisContext,
  metrics: NodeMetricsResponse,
) {
  const node = context.stored.snapshot.nodes.find(
    (item) => item.name === metrics.node.name,
  );
  return {
    name: metrics.node.name,
    summary: metrics.summary,
    capacity: node?.capacity,
    recentCpuPoints: metrics.cpu.points.slice(-8),
    recentMemoryPoints: metrics.memory.points.slice(-8),
  };
}

function tryParseAnalysis(
  value: string,
): Omit<
  DeploymentAnalysisResponse,
  "deployment" | "generatedAt" | "usedSources" | "degradedSources" | "relatedResources"
> | undefined {
  const normalized = value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    const parsed = JSON.parse(normalized) as Partial<DeploymentAnalysisResponse>;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }

    return {
      executiveSummary:
        typeof parsed.executiveSummary === "string"
          ? parsed.executiveSummary
          : "",
      overallRisk:
        parsed.overallRisk === "healthy" ||
        parsed.overallRisk === "warning" ||
        parsed.overallRisk === "critical"
          ? parsed.overallRisk
          : "warning",
      scorecards: Array.isArray(parsed.scorecards)
        ? (parsed.scorecards.filter(Boolean) as DeploymentAnalysisScorecard[])
        : [],
      findings: Array.isArray(parsed.findings)
        ? (parsed.findings.filter(Boolean) as DeploymentAnalysisFinding[])
        : [],
      improvements: Array.isArray(parsed.improvements)
        ? (parsed.improvements.filter(Boolean) as DeploymentImprovementSuggestion[])
        : [],
      reviewCommands: Array.isArray(parsed.reviewCommands)
        ? parsed.reviewCommands.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      suggestedYamlPatches: Array.isArray(parsed.suggestedYamlPatches)
        ? (parsed.suggestedYamlPatches.filter(Boolean) as SuggestedYamlPatch[])
        : [],
    };
  } catch {
    return undefined;
  }
}

function dedupeFindings(findings: DeploymentAnalysisFinding[]) {
  return Array.from(
    new Map(findings.map((finding) => [finding.id, finding])).values(),
  ).slice(0, 12);
}

function mapIssueCategory(
  category: Issue["category"],
): DeploymentAnalysisCategory {
  if (
    category === "rollout" ||
    category === "availability" ||
    category === "autoscaling" ||
    category === "capacity" ||
    category === "networking" ||
    category === "configuration" ||
    category === "cleanup"
  ) {
    return category;
  }
  if (category === "reliability") {
    return "availability";
  }
  return "security";
}

function metricEvidence(
  label: string,
  value: number | undefined,
  type: "cpu" | "memory",
) {
  if (value === undefined) {
    return undefined;
  }

  return {
    label,
    value: formatMetric(value, type),
  };
}

function formatMetric(value: number | undefined, type: "cpu" | "memory") {
  if (value === undefined) {
    return "--";
  }

  if (type === "cpu") {
    return value < 1
      ? `${Math.round(value * 1000)}m`
      : `${value.toFixed(2)} cores`;
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function recommendCpuRequest(avg?: number) {
  const base = Math.max(avg ?? 0.1, 0.05);
  return formatCpuQuantity(base * 1.2);
}

function recommendCpuLimit(max?: number, request?: string) {
  const numericRequest = parseCpuQuantity(request ?? "100m");
  const base = Math.max(max ?? numericRequest * 2, numericRequest * 2, 0.2);
  return formatCpuQuantity(base * 1.25);
}

function recommendMemoryRequest(avg?: number) {
  const base = Math.max(avg ?? 268435456, 134217728);
  return formatMemoryQuantity(base * 1.15);
}

function recommendMemoryLimit(max?: number, request?: string) {
  const numericRequest = parseMemoryQuantity(request ?? "256Mi");
  const base = Math.max(max ?? numericRequest * 1.5, numericRequest * 1.5);
  return formatMemoryQuantity(base * 1.2);
}

function formatCpuQuantity(value: number) {
  if (value < 1) {
    return `${Math.max(Math.round(value * 1000), 50)}m`;
  }
  return `${Math.round(value * 100) / 100}`;
}

function parseCpuQuantity(value: string) {
  if (value.endsWith("m")) {
    return Number(value.slice(0, -1)) / 1000;
  }
  return Number(value);
}

function formatMemoryQuantity(value: number) {
  const mebibytes = Math.max(Math.round(value / (1024 * 1024)), 128);
  return `${mebibytes}Mi`;
}

function parseMemoryQuantity(value: string) {
  if (value.endsWith("Mi")) {
    return Number(value.slice(0, -2)) * 1024 * 1024;
  }
  if (value.endsWith("Gi")) {
    return Number(value.slice(0, -2)) * 1024 * 1024 * 1024;
  }
  return Number(value);
}

function extractFirstContainerName(yaml?: string) {
  if (!yaml) {
    return undefined;
  }
  const match = yaml.match(/containers:\s*\n(?:\s*-\s*name:\s*([^\n]+))/i);
  return match?.[1]?.trim();
}

function inferResourceRole(
  kind: ResourceKind,
  key: string,
  deploymentKey: string,
  relations: StoredSnapshot["snapshot"]["relations"],
) {
  if (key === deploymentKey) {
    return "deployment principal";
  }
  const directRelation = relations.find(
    (relation) => relation.fromKey === deploymentKey && relation.toKey === key,
  );
  if (directRelation) {
    return directRelation.label;
  }
  switch (kind) {
    case "Service":
      return "service de exposicao";
    case "Ingress":
      return "ingress conectado";
    case "EndpointSlice":
      return "endpoint slice";
    case "ReplicaSet":
      return "replica set do rollout";
    case "Pod":
      return "pod gerado";
    case "Node":
      return "node onde o workload roda";
    case "HorizontalPodAutoscaler":
      return "autoscaler";
    case "PodDisruptionBudget":
      return "protecao de disponibilidade";
    case "ServiceAccount":
      return "identidade do workload";
    case "ConfigMap":
    case "Secret":
    case "PersistentVolumeClaim":
      return "dependencia estrutural";
    default:
      return "relacao associada";
  }
}

function buildResourceKey(kind: string, name: string, namespace?: string) {
  return namespace ? `${kind}:${namespace}/${name}` : `${kind}:${name}`;
}

function parseResourceKey(key: string) {
  const [kind, remainder] = key.split(":");
  if (!kind || !remainder) {
    return undefined;
  }
  if (!remainder.includes("/")) {
    return {
      kind: kind as ResourceKind,
      name: remainder,
    };
  }
  const [namespace, name] = remainder.split("/", 2);
  return {
    kind: kind as ResourceKind,
    namespace,
    name,
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(
      values.filter(
        (value) => typeof value === "string" && value.trim().length > 0,
      ),
    ),
  );
}

function maxPoint(points: Array<{ value: number }>) {
  if (points.length === 0) {
    return undefined;
  }
  return points.reduce(
    (max, point) => Math.max(max, point.value),
    points[0]?.value ?? 0,
  );
}
