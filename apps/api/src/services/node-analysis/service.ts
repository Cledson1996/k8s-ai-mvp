import OpenAI from "openai";
import type {
  DeploymentAnalysisCategory,
  DeploymentAnalysisRisk,
  Issue,
  IssueEvidence,
  NodeAnalysisFinding,
  NodeAnalysisRelatedResource,
  NodeAnalysisResponse,
  NodeAnalysisScorecard,
  NodeHealth,
  NodeImprovementSuggestion,
  NodeMetricsResponse,
  ResourceDetail,
  ResourceRef,
  SuggestedYamlPatch,
} from "@k8s-ai-mvp/shared";
import type { AppConfig } from "../../config.js";
import type { AnalysisService } from "../analysis/service.js";
import type {
  SnapshotRepository,
  StoredSnapshot,
} from "../snapshot/repository.js";

export interface NodeAnalysisService {
  getSavedNodeAnalysis(name: string): Promise<NodeAnalysisResponse | undefined>;
  analyzeNode(name: string): Promise<NodeAnalysisResponse | undefined>;
  clearNodeAnalysis(name: string): Promise<boolean>;
}

interface NodeWorkloadMetric {
  key: string;
  kind: string;
  name: string;
  namespace?: string;
  cpuAvg?: number;
  cpuMax?: number;
  memoryAvg?: number;
  memoryMax?: number;
}

interface NodeAnalysisContext {
  node: NodeHealth;
  detail: ResourceDetail;
  stored: StoredSnapshot;
  nodeMetrics?: NodeMetricsResponse;
  workloadMetrics: NodeWorkloadMetric[];
  relatedResources: NodeAnalysisRelatedResource[];
  relatedIssues: Issue[];
  degradedSources: string[];
}

interface ParsedNodeAnalysis {
  executiveSummary?: string;
  overallRisk?: DeploymentAnalysisRisk;
  scorecards?: NodeAnalysisScorecard[];
  findings?: NodeAnalysisFinding[];
  improvements?: NodeImprovementSuggestion[];
  reviewCommands?: string[];
  suggestedYamlPatches?: SuggestedYamlPatch[];
}

export class LiveNodeAnalysisService implements NodeAnalysisService {
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

  async getSavedNodeAnalysis(
    name: string,
  ): Promise<NodeAnalysisResponse | undefined> {
    await this.analysisService.getLatestOrRun();
    const stored = this.repository.getLatest();
    if (!stored) {
      return undefined;
    }
    const node = stored.snapshot.nodes.find((item) => item.name === name);
    if (!node) {
      return undefined;
    }
    return this.repository.getNodeAnalysis(name);
  }

  async clearNodeAnalysis(name: string): Promise<boolean> {
    await this.analysisService.getLatestOrRun();
    const stored = this.repository.getLatest();
    if (!stored) {
      return false;
    }
    const node = stored.snapshot.nodes.find((item) => item.name === name);
    if (!node) {
      return false;
    }
    this.repository.deleteNodeAnalysis(name);
    return true;
  }

  async analyzeNode(name: string): Promise<NodeAnalysisResponse | undefined> {
    await this.analysisService.getLatestOrRun();
    const stored = this.repository.getLatest();
    if (!stored) {
      return undefined;
    }

    const node = stored.snapshot.nodes.find((item) => item.name === name);
    const detail = stored.detailsByKey[`Node:${name}`];
    if (!node || !detail) {
      return undefined;
    }

    const relatedResources = collectRelatedResources(stored, node, detail);
    const relatedIssues = collectRelatedIssues(stored, name, relatedResources);
    const [nodeMetrics, workloadMetrics] = await Promise.all([
      this.analysisService.getNodeMetrics(name, "7d").catch(() => undefined),
      loadWorkloadMetrics(this.analysisService, node.workloads ?? []),
    ]);

    const degradedSources = Array.from(
      new Set([
        ...stored.snapshot.degradedSources,
        ...(nodeMetrics?.degradedSources ?? []),
      ]),
    );

    const context: NodeAnalysisContext = {
      node,
      detail,
      stored,
      nodeMetrics,
      workloadMetrics,
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
      const fallback = { ...heuristic, usedSources };
      this.repository.saveNodeAnalysis(fallback);
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
                  "Voce e um assistente de SRE e plataforma. Analise apenas o contexto fornecido de um node Kubernetes. Responda sempre em portugues do Brasil. Retorne JSON estrito com executiveSummary, overallRisk, scorecards, findings, improvements, reviewCommands e suggestedYamlPatches. Foque em capacidade, estabilidade, distribuicao, scheduling, pressao, cleanup, qualidade dos workloads e riscos de crescimento. Nunca proponha escrita automatica no cluster.",
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

      const parsed = tryParseNodeAnalysis(response.output_text ?? "");
      if (!parsed) {
        const fallback = { ...heuristic, usedSources };
        this.repository.saveNodeAnalysis(fallback);
        return fallback;
      }

      const result: NodeAnalysisResponse = {
        node: { name: context.node.name },
        generatedAt: new Date().toISOString(),
        usedSources,
        degradedSources,
        executiveSummary:
          parsed.executiveSummary?.trim() || heuristic.executiveSummary,
        overallRisk: parsed.overallRisk ?? heuristic.overallRisk,
        scorecards:
          parsed.scorecards && parsed.scorecards.length > 0
            ? parsed.scorecards
            : heuristic.scorecards,
        findings:
          parsed.findings && parsed.findings.length > 0
            ? parsed.findings
            : heuristic.findings,
        improvements:
          parsed.improvements && parsed.improvements.length > 0
            ? parsed.improvements
            : heuristic.improvements,
        reviewCommands:
          parsed.reviewCommands && parsed.reviewCommands.length > 0
            ? uniqueStrings(parsed.reviewCommands)
            : heuristic.reviewCommands,
        suggestedYamlPatches:
          parsed.suggestedYamlPatches && parsed.suggestedYamlPatches.length > 0
            ? parsed.suggestedYamlPatches
            : heuristic.suggestedYamlPatches,
        relatedResources: heuristic.relatedResources,
      };
      this.repository.saveNodeAnalysis(result);
      return result;
    } catch {
      const fallback = { ...heuristic, usedSources };
      this.repository.saveNodeAnalysis(fallback);
      return fallback;
    }
  }
}

async function loadWorkloadMetrics(
  analysisService: AnalysisService,
  workloads: NodeHealth["workloads"],
): Promise<NodeWorkloadMetric[]> {
  const candidates = [...(workloads ?? [])]
    .filter((item) => item.kind === "Deployment" && item.namespace)
    .sort(
      (left, right) =>
        (right.cpuCores ?? 0) - (left.cpuCores ?? 0) ||
        (right.memoryBytes ?? 0) - (left.memoryBytes ?? 0),
    )
    .slice(0, 5);

  const metrics = await Promise.all(
    candidates.map(async (workload) => {
      try {
        const response = await analysisService.getDeploymentMetrics(
          workload.namespace!,
          workload.name,
          "7d",
        );
        return {
          key:
            workload.key ??
            `${workload.kind}:${workload.namespace}/${workload.name}`,
          kind: workload.kind,
          name: workload.name,
          namespace: workload.namespace,
          cpuAvg: response?.summary.cpu.avg,
          cpuMax: response?.summary.cpu.max,
          memoryAvg: response?.summary.memory.avg,
          memoryMax: response?.summary.memory.max,
        } satisfies NodeWorkloadMetric;
      } catch {
        return {
          key:
            workload.key ??
            `${workload.kind}:${workload.namespace}/${workload.name}`,
          kind: workload.kind,
          name: workload.name,
          namespace: workload.namespace,
        } satisfies NodeWorkloadMetric;
      }
    }),
  );

  return metrics;
}

function collectRelatedResources(
  stored: StoredSnapshot,
  node: NodeHealth,
  detail: ResourceDetail,
): NodeAnalysisRelatedResource[] {
  const resourceKeys = new Set<string>([`Node:${node.name}`]);
  for (const relation of stored.snapshot.relations) {
    if (relation.fromKey === `Node:${node.name}`) {
      resourceKeys.add(relation.toKey);
    }
    if (relation.toKey === `Node:${node.name}`) {
      resourceKeys.add(relation.fromKey);
    }
  }

  for (const workload of node.workloads ?? []) {
    if (workload.key) {
      resourceKeys.add(workload.key);
    }
  }

  for (const relation of stored.snapshot.relations) {
    if (resourceKeys.has(relation.fromKey)) {
      resourceKeys.add(relation.toKey);
    }
    if (resourceKeys.has(relation.toKey)) {
      resourceKeys.add(relation.fromKey);
    }
  }

  const items: NodeAnalysisRelatedResource[] = [];
  for (const key of resourceKeys) {
    const resource = stored.detailsByKey[key];
    if (!resource) {
      continue;
    }
    items.push({
      key,
      kind: resource.kind,
      name: resource.name,
      namespace: resource.namespace,
      role: describeNodeRole(resource, detail),
      status: resource.status,
      summary: describeResourceSummary(resource),
      manifestYaml: resource.manifestYaml,
    });
  }

  return items.sort((left, right) => left.kind.localeCompare(right.kind));
}

function collectRelatedIssues(
  stored: StoredSnapshot,
  nodeName: string,
  relatedResources: NodeAnalysisRelatedResource[],
): Issue[] {
  const keys = new Set(
    relatedResources.map((resource) => buildIssueResourceKey(resource)),
  );
  keys.add(`Node:${nodeName}`);

  return stored.snapshot.issues.filter((issue) => {
    const ref = issue.resourceRef;
    if (!ref) {
      return false;
    }
    if (ref.kind === "Node" && ref.name === nodeName) {
      return true;
    }
    return keys.has(buildIssueResourceKey(ref));
  });
}

function buildHeuristicAnalysis(
  context: NodeAnalysisContext,
): Omit<NodeAnalysisResponse, "usedSources"> {
  const findings = buildFindings(context);
  const improvements = buildImprovements(context, findings);
  const suggestedYamlPatches = buildSuggestedYamlPatches(context, findings);
  const reviewCommands = uniqueStrings([
    ...context.detail.suggestedCommands,
    ...context.relatedIssues.flatMap((issue) => issue.suggestedCommands),
    `kubectl describe node ${context.node.name}`,
    `kubectl top node ${context.node.name}`,
  ]).slice(0, 12);

  return {
    node: { name: context.node.name },
    generatedAt: new Date().toISOString(),
    degradedSources: context.degradedSources,
    executiveSummary: buildExecutiveSummary(context, findings, improvements),
    overallRisk: deriveOverallRisk(findings),
    scorecards: buildScorecards(context, findings),
    findings,
    improvements,
    reviewCommands,
    suggestedYamlPatches,
    relatedResources: context.relatedResources,
  };
}

function buildFindings(context: NodeAnalysisContext): NodeAnalysisFinding[] {
  const findings: NodeAnalysisFinding[] = [];
  const nodeRef: ResourceRef = { kind: "Node", name: context.node.name };
  const cpuTotal = context.node.capacity.cpu.total;
  const memoryTotal = context.node.capacity.memory.total;
  const storageTotal = context.node.capacity.storage.total;
  const storageUsed = context.node.capacity.storage.used;

  for (const issue of context.relatedIssues.slice(0, 14)) {
    findings.push({
      id: issue.id,
      category: mapIssueCategory(issue.category),
      severity: issue.severity,
      title: issue.title,
      resource: issue.resourceRef ?? nodeRef,
      evidence: issue.evidence,
      impact: issue.summary,
      recommendation: issue.recommendation,
    });
  }

  const cpuPeakPercent =
    cpuTotal && context.nodeMetrics?.summary.cpu.max !== undefined
      ? (context.nodeMetrics.summary.cpu.max / cpuTotal) * 100
      : context.node.usage.cpuPercent;
  if ((cpuPeakPercent ?? 0) >= 80) {
    findings.push({
      id: `${context.node.name}-cpu-pressure`,
      category: "capacity",
      severity: (cpuPeakPercent ?? 0) >= 90 ? "high" : "medium",
      title: "Node com pico historico alto de CPU",
      resource: nodeRef,
      evidence: [
        metricEvidence("CPU media 7d", context.nodeMetrics?.summary.cpu.avg, "cpu"),
        metricEvidence("CPU pico 7d", context.nodeMetrics?.summary.cpu.max, "cpu"),
        { label: "CPU total", value: formatCpu(cpuTotal) },
      ].filter(Boolean) as IssueEvidence[],
      impact:
        "O node pode perder folga para crescimento, drenagem ou picos simultaneos de workloads pesados.",
      recommendation:
        "Revise distribuicao, requests e limits dos workloads mais pesados e necessidade de mais capacidade ou HPA.",
    });
  }

  const memoryPeakPercent =
    memoryTotal && context.nodeMetrics?.summary.memory.max !== undefined
      ? (context.nodeMetrics.summary.memory.max / memoryTotal) * 100
      : context.node.usage.memoryPercent;
  if ((memoryPeakPercent ?? 0) >= 85) {
    findings.push({
      id: `${context.node.name}-memory-pressure`,
      category: "capacity",
      severity: (memoryPeakPercent ?? 0) >= 92 ? "critical" : "high",
      title: "Node com pico historico alto de memoria",
      resource: nodeRef,
      evidence: [
        metricEvidence("RAM media 7d", context.nodeMetrics?.summary.memory.avg, "memory"),
        metricEvidence("RAM pico 7d", context.nodeMetrics?.summary.memory.max, "memory"),
        { label: "RAM total", value: formatMemory(memoryTotal) },
      ].filter(Boolean) as IssueEvidence[],
      impact:
        "Pressao de memoria aumenta risco de OOM, eviction e perda de estabilidade dos pods hospedados.",
      recommendation:
        "Revise os workloads que mais consomem RAM neste node e distribua replicas ou ajuste requests e limits.",
    });
  }

  if (context.node.pressure.length > 0) {
    findings.push({
      id: `${context.node.name}-pressure`,
      category: "availability",
      severity: "high",
      title: "Node com sinais de pressao do kubelet",
      resource: nodeRef,
      evidence: context.node.pressure.map((pressure) => ({
        label: "Pressure",
        value: pressure,
      })),
      impact:
        "A estabilidade do node fica comprometida, e isso pode afetar pods saudaveis sem mudanca direta no deployment.",
      recommendation:
        "Investigue eventos do node, consumo real, eviction pressure e workloads que concentram reinicios ou uso excessivo.",
    });
  }

  if (storageTotal !== undefined && storageUsed !== undefined) {
    const storagePercent = (storageUsed / storageTotal) * 100;
    if (storagePercent >= 85) {
      findings.push({
        id: `${context.node.name}-storage-pressure`,
        category: "capacity",
        severity: storagePercent >= 92 ? "high" : "medium",
        title: "Node com armazenamento pressionado",
        resource: nodeRef,
        evidence: [
          { label: "Storage usado", value: formatMemory(storageUsed) },
          { label: "Storage total", value: formatMemory(storageTotal) },
        ],
        impact:
          "Ephemeral storage pressionado pode causar eviction e falhas em workloads com escrita local ou logs altos.",
        recommendation:
          "Revise jobs, logs e workloads que usam disco local, e confirme se ha folga suficiente para manutencao.",
      });
    }
  } else {
    findings.push({
      id: `${context.node.name}-storage-unknown`,
      category: "configuration",
      severity: "low",
      title: "Uso real de armazenamento do node nao esta disponivel",
      resource: nodeRef,
      evidence: [{ label: "Storage", value: "historico ou uso atual indisponivel" }],
      impact:
        "Sem visibilidade real de storage, a equipe pode perder sinais de saturacao local ou eviction por disco.",
      recommendation:
        "Valide metricas de filesystem do node no Prometheus para completar a leitura operacional.",
    });
  }

  const hotWorkloads = [...(context.node.workloads ?? [])]
    .sort(
      (left, right) =>
        (right.cpuCores ?? 0) - (left.cpuCores ?? 0) ||
        (right.memoryBytes ?? 0) - (left.memoryBytes ?? 0),
    )
    .slice(0, 3);
  if (hotWorkloads.length > 0) {
    const dominantCpu = hotWorkloads[0];
    if (
      context.node.usage.cpuCores &&
      dominantCpu.cpuCores &&
      dominantCpu.cpuCores / context.node.usage.cpuCores >= 0.45
    ) {
      findings.push({
        id: `${context.node.name}-hotspot-workload`,
        category: "capacity",
        severity: "medium",
        title: "Um workload concentra boa parte do consumo atual do node",
        resource: {
          kind: dominantCpu.kind,
          namespace: dominantCpu.namespace,
          name: dominantCpu.name,
        },
        evidence: [
          { label: "Workload", value: dominantCpu.name },
          { label: "CPU atual workload", value: formatCpu(dominantCpu.cpuCores) },
          { label: "CPU atual node", value: formatCpu(context.node.usage.cpuCores) },
        ],
        impact:
          "A distribuicao de carga fica mais fragil e pequenos picos desse workload podem pressionar o node inteiro.",
        recommendation:
          "Avalie afinidade, HPA, requests, limits e dispersao de replicas para evitar hotspot concentrado em um unico node.",
      });
    }
  }

  const unstableWorkloads = (context.node.workloads ?? []).filter(
    (workload) => (workload.restartCount ?? 0) >= 3 || (workload.issueCount ?? 0) >= 2,
  );
  if (unstableWorkloads.length > 0) {
    findings.push({
      id: `${context.node.name}-unstable-workloads`,
      category: "availability",
      severity: "high",
      title: "Node concentrando workloads instaveis",
      resource: nodeRef,
      evidence: unstableWorkloads.slice(0, 5).map((workload) => ({
        label: `${workload.namespace}/${workload.name}`,
        value: `${workload.restartCount ?? 0} restarts | ${workload.issueCount ?? 0} issues`,
      })),
      impact:
        "Instabilidade acumulada no mesmo node pode esconder problema de scheduling, pressure local ou configuracao fraca dos workloads.",
      recommendation:
        "Revise pods com restart alto, probes, eventos e se existe correlacao com pressao do node ou baixa folga historica.",
    });
  }

  if (context.node.taints.length > 0 && (context.node.workloads?.length ?? 0) >= 5) {
    findings.push({
      id: `${context.node.name}-taint-constrained`,
      category: "configuration",
      severity: "medium",
      title: "Node com taints e concentracao relevante de workloads",
      resource: nodeRef,
      evidence: context.node.taints.map((taint) => ({
        label: "Taint",
        value: taint,
      })),
      impact:
        "Restricoes de scheduling podem prender workloads no mesmo grupo de nodes e reduzir a capacidade de redistribuicao.",
      recommendation:
        "Confirme se taints, tolerations, node selectors e affinity ainda refletem a estrategia atual de capacidade.",
    });
  }

  return dedupeFindings(findings);
}

function buildImprovements(
  context: NodeAnalysisContext,
  findings: NodeAnalysisFinding[],
): NodeImprovementSuggestion[] {
  const improvements: NodeImprovementSuggestion[] = [];
  const nodeRef: ResourceRef = { kind: "Node", name: context.node.name };

  if (findings.some((finding) => finding.category === "capacity")) {
    improvements.push({
      id: `${context.node.name}-rebalance-capacity`,
      title: "Rebalancear carga e revisar headroom do node",
      priority: "high",
      summary:
        "Use o historico de CPU e RAM deste node para revisar distribuicao de replicas, requests e limits e folga para crescimento ou drenagem.",
      resource: nodeRef,
    });
  }

  if (context.node.pressure.length > 0) {
    improvements.push({
      id: `${context.node.name}-stabilize-pressure`,
      title: "Tratar sinais de pressao antes de ampliar carga",
      priority: "high",
      summary:
        "Pressao do kubelet combinada com workloads relevantes indica risco real de indisponibilidade e pede revisao operacional do node.",
      resource: nodeRef,
    });
  }

  if ((context.node.workloads ?? []).some((item) => (item.issueCount ?? 0) > 0)) {
    improvements.push({
      id: `${context.node.name}-fix-heavy-workloads`,
      title: "Ajustar os workloads mais pesados hospedados neste node",
      priority: "medium",
      summary:
        "Os workloads que mais pressionam o node devem ganhar requests, limits, probes, HPA ou melhor dispersao para reduzir hotspot e restart.",
      resource: nodeRef,
    });
  }

  if (context.node.taints.length > 0) {
    improvements.push({
      id: `${context.node.name}-review-scheduling`,
      title: "Revisar taints e restricoes de scheduling",
      priority: "medium",
      summary:
        "Confirme se taints, tolerations, selectors e affinities ainda fazem sentido para a distribuicao atual do cluster.",
      resource: nodeRef,
    });
  }

  if (
    context.relatedIssues.some((issue) => issue.category === "cleanup") ||
    findings.some((finding) => finding.category === "cleanup")
  ) {
    improvements.push({
      id: `${context.node.name}-cleanup-local-noise`,
      title: "Limpar ruido operacional ao redor do node",
      priority: "low",
      summary:
        "Jobs antigos, pods falhos e objetos sem uso perto deste node atrapalham leitura e podem esconder o risco real.",
      resource: nodeRef,
    });
  }

  return improvements.slice(0, 8);
}

function buildSuggestedYamlPatches(
  context: NodeAnalysisContext,
  findings: NodeAnalysisFinding[],
): SuggestedYamlPatch[] {
  const patches: SuggestedYamlPatch[] = [];
  const workloadResources = context.relatedResources.filter(
    (resource) =>
      resource.kind === "Deployment" &&
      resource.namespace &&
      Boolean(resource.manifestYaml),
  );

  const needsResources = findings.some(
    (finding) =>
      finding.title.toLowerCase().includes("resource") ||
      finding.recommendation.toLowerCase().includes("requests"),
  );
  const needsProbes = findings.some(
    (finding) =>
      finding.title.toLowerCase().includes("probe") ||
      finding.recommendation.toLowerCase().includes("probes"),
  );

  for (const resource of workloadResources.slice(0, 3)) {
    if (needsResources) {
      patches.push({
        resource: {
          kind: "Deployment",
          namespace: resource.namespace,
          name: resource.name,
        },
        reason: "Ajustar requests e limits do workload que pressiona este node.",
        yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${resource.name}
  namespace: ${resource.namespace}
spec:
  template:
    spec:
      containers:
        - name: app
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1"
              memory: "512Mi"`,
        note: "Revise manualmente os valores com base no historico real antes de aplicar.",
      });
    }

    if (needsProbes) {
      patches.push({
        resource: {
          kind: "Deployment",
          namespace: resource.namespace,
          name: resource.name,
        },
        reason: "Adicionar probes para reduzir restart cego e melhorar a estabilidade observada neste node.",
        yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${resource.name}
  namespace: ${resource.namespace}
spec:
  template:
    spec:
      containers:
        - name: app
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 15`,
        note: "Confirme porta, path e tempos reais da aplicacao antes de usar este YAML.",
      });
    }
  }

  return patches.slice(0, 4);
}

function buildExecutiveSummary(
  context: NodeAnalysisContext,
  findings: NodeAnalysisFinding[],
  improvements: NodeImprovementSuggestion[],
): string {
  const pressure =
    context.node.pressure.length > 0
      ? `O node apresenta pressao em ${context.node.pressure.join(", ")}.`
      : "O node nao mostra pressao explicita do kubelet nesta coleta.";
  const topIssue = findings[0]?.title
    ? `Principal alerta: ${findings[0].title}.`
    : "Nenhum achado relevante foi consolidado alem do baseline.";
  const workloadSummary =
    context.node.workloads?.length
      ? `Ha ${context.node.workloads.length} workloads observados neste node.`
      : "Nao houve workloads associados ao node nesta coleta.";

  return `${pressure} ${topIssue} ${workloadSummary} ${improvements.length > 0 ? `Priorize ${improvements[0].title.toLowerCase()}.` : "Mantenha acompanhamento do historico e da distribuicao de carga."}`;
}

function buildScorecards(
  context: NodeAnalysisContext,
  findings: NodeAnalysisFinding[],
): NodeAnalysisScorecard[] {
  return [
    buildScorecard(
      "capacity",
      "Capacidade",
      findings,
      context.nodeMetrics?.summary.cpu.max !== undefined ||
        context.nodeMetrics?.summary.memory.max !== undefined
        ? `CPU pico ${formatCpu(context.nodeMetrics?.summary.cpu.max)} | RAM pico ${formatMemory(context.nodeMetrics?.summary.memory.max)}`
        : "Historico parcial ou indisponivel.",
    ),
    buildScorecard(
      "availability",
      "Estabilidade",
      findings,
      context.node.pressure.length > 0
        ? `Pressao detectada: ${context.node.pressure.join(", ")}`
        : "Sem pressao explicita nesta coleta.",
    ),
    buildScorecard(
      "configuration",
      "Scheduling",
      findings,
      context.node.taints.length > 0
        ? `Taints ativos: ${context.node.taints.join(", ")}`
        : "Sem taints relevantes neste node.",
    ),
    buildScorecard(
      "cleanup",
      "Limpeza",
      findings,
      `Issues de cleanup relacionados: ${context.relatedIssues.filter((issue) => issue.category === "cleanup").length}`,
    ),
    buildScorecard(
      "networking",
      "Rede indireta",
      findings,
      `Recursos de rede relacionados: ${context.relatedResources.filter((item) => item.kind === "Service" || item.kind === "Ingress" || item.kind === "EndpointSlice").length}`,
    ),
    buildScorecard(
      "security",
      "Seguranca basica",
      findings,
      "Leitura estrutural de service account, exposicao e configuracoes relacionadas.",
    ),
  ];
}

function buildScorecard(
  category: DeploymentAnalysisCategory,
  label: string,
  findings: NodeAnalysisFinding[],
  summary: string,
): NodeAnalysisScorecard {
  const relevant = findings.filter((finding) => finding.category === category);
  return {
    category,
    label,
    risk: deriveOverallRisk(relevant),
    summary,
  };
}

function buildAiPromptPayload(context: NodeAnalysisContext) {
  return {
    node: {
      name: context.node.name,
      status: context.node.status,
      roles: context.node.roles,
      taints: context.node.taints,
      pressure: context.node.pressure,
      podCount: context.node.podCount,
      usage: context.node.usage,
      capacity: context.node.capacity,
      history: context.nodeMetrics?.summary,
    },
    topWorkloads: (context.node.workloads ?? []).slice(0, 8),
    workloadHistory: context.workloadMetrics,
    relatedIssues: context.relatedIssues.slice(0, 20),
    relatedResources: context.relatedResources.slice(0, 20),
    detail: {
      summary: describeResourceSummary(context.detail),
      suggestedCommands: context.detail.suggestedCommands,
      insights: context.detail.insights,
      manifestYaml: context.detail.manifestYaml,
    },
    degradedSources: context.degradedSources,
    requiredShape: {
      executiveSummary: "string",
      overallRisk: "healthy | warning | critical",
      scorecards: [
        {
          category:
            "capacity | availability | configuration | cleanup | networking | security",
          label: "string",
          risk: "healthy | warning | critical",
          summary: "string",
        },
      ],
      findings: [
        {
          id: "string",
          category:
            "capacity | availability | configuration | cleanup | networking | security",
          severity: "low | medium | high | critical",
          title: "string",
          resource: { kind: "string", name: "string", namespace: "string?" },
          evidence: [{ label: "string", value: "string" }],
          impact: "string",
          recommendation: "string",
        },
      ],
      improvements: [
        {
          id: "string",
          title: "string",
          priority: "low | medium | high | critical",
          summary: "string",
        },
      ],
      reviewCommands: ["string"],
      suggestedYamlPatches: [
        {
          resource: { kind: "string", name: "string", namespace: "string?" },
          reason: "string",
          yaml: "string",
          note: "string",
        },
      ],
    },
  };
}

function tryParseNodeAnalysis(text: string): ParsedNodeAnalysis | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return undefined;
  }

  try {
    return JSON.parse(match[0]) as ParsedNodeAnalysis;
  } catch {
    return undefined;
  }
}

function describeNodeRole(resource: ResourceDetail, nodeDetail: ResourceDetail) {
  if (resource.kind === "Node") {
    return "node principal";
  }
  if (resource.kind === "Pod") {
    return "pod no node";
  }
  if (
    resource.kind === "Deployment" ||
    resource.kind === "StatefulSet" ||
    resource.kind === "DaemonSet" ||
    resource.kind === "Job" ||
    resource.kind === "CronJob"
  ) {
    return "workload no node";
  }
  if (resource.kind === "Service" || resource.kind === "Ingress") {
    return "rede relacionada";
  }
  if (resource.kind === "HorizontalPodAutoscaler") {
    return "autoscaler relacionado";
  }
  if (resource.kind === "PodDisruptionBudget") {
    return "policy de disponibilidade";
  }
  if (resource.kind === "ServiceAccount") {
    return "identidade do workload";
  }
  if (resource.key === nodeDetail.key) {
    return "node principal";
  }
  return "dependencia estrutural";
}

function describeResourceSummary(resource: ResourceDetail) {
  const replicas = resource.replicas
    ? `${resource.replicas.ready ?? "--"}/${resource.replicas.desired ?? "--"} replicas`
    : undefined;
  const usage =
    resource.usage?.cpuCores !== undefined || resource.usage?.memoryBytes !== undefined
      ? `${formatCpu(resource.usage?.cpuCores)} CPU | ${formatMemory(resource.usage?.memoryBytes)} RAM`
      : undefined;
  return [resource.kind, resource.status, replicas, usage]
    .filter(Boolean)
    .join(" | ");
}

function buildIssueResourceKey(
  ref:
    | NodeAnalysisRelatedResource
    | {
        kind: string;
        name: string;
        namespace?: string;
      },
) {
  return ref.namespace
    ? `${ref.kind}:${ref.namespace}/${ref.name}`
    : `${ref.kind}:${ref.name}`;
}

function metricEvidence(
  label: string,
  value: number | undefined,
  formatter: "cpu" | "memory",
): IssueEvidence | undefined {
  if (value === undefined) {
    return undefined;
  }
  return {
    label,
    value: formatter === "cpu" ? formatCpu(value) : formatMemory(value),
  };
}

function formatCpu(value: number | undefined) {
  if (value === undefined) {
    return "--";
  }
  return value >= 1 ? `${value.toFixed(2)} cores` : `${Math.round(value * 1000)}m`;
}

function formatMemory(value: number | undefined) {
  if (value === undefined) {
    return "--";
  }
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function deriveOverallRisk(
  findings: Array<{ severity: string }> | undefined,
): DeploymentAnalysisRisk {
  if (!findings || findings.length === 0) {
    return "healthy";
  }
  if (findings.some((finding) => finding.severity === "critical" || finding.severity === "high")) {
    return "critical";
  }
  return "warning";
}

function mapIssueCategory(category: string): DeploymentAnalysisCategory {
  if (
    category === "rollout" ||
    category === "availability" ||
    category === "autoscaling" ||
    category === "capacity" ||
    category === "networking" ||
    category === "configuration" ||
    category === "security" ||
    category === "cleanup"
  ) {
    return category;
  }
  if (category === "efficiency") {
    return "capacity";
  }
  return "configuration";
}

function dedupeFindings<T extends { id: string }>(findings: T[]) {
  const map = new Map<string, T>();
  for (const finding of findings) {
    if (!map.has(finding.id)) {
      map.set(finding.id, finding);
    }
  }
  return [...map.values()];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}
