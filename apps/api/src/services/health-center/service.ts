import type {
  DeploymentInventory,
  HealthCenterAnalysisTarget,
  HealthCenterCard,
  HealthCenterRelatedResource,
  HealthCenterResponse,
  HealthCenterSection,
  HealthCenterTrend,
  Issue,
  IssueCategory,
  NodeHealth,
  ResourceDetail,
  ResourceKind,
  ResourceRef,
  Severity,
} from "@k8s-ai-mvp/shared";
import type { AnalysisService } from "../analysis/service.js";
import type {
  SnapshotRepository,
  StoredSnapshot,
} from "../snapshot/repository.js";

export interface HealthCenterService {
  getHealthCenter(): Promise<HealthCenterResponse>;
  runHealthCenter(): Promise<HealthCenterResponse>;
}

interface TrendBundle {
  nodes1h: NodeHealth[];
  nodes6h: NodeHealth[];
  nodes24h: NodeHealth[];
  nodes7d: NodeHealth[];
  deployments1h: DeploymentInventory[];
  deployments6h: DeploymentInventory[];
  deployments24h: DeploymentInventory[];
  deployments7d: DeploymentInventory[];
  degradedSources: string[];
}

export class LiveHealthCenterService implements HealthCenterService {
  private cached?:
    | {
        key: string;
        generatedAt: number;
        data: HealthCenterResponse;
      }
    | undefined;

  constructor(
    private readonly analysisService: AnalysisService,
    private readonly repository: SnapshotRepository,
  ) {}

  async getHealthCenter(): Promise<HealthCenterResponse> {
    await this.analysisService.getLatestOrRun();
    return this.buildHealthCenter(false);
  }

  async runHealthCenter(): Promise<HealthCenterResponse> {
    await this.analysisService.runAnalysis();
    return this.buildHealthCenter(true);
  }

  private async buildHealthCenter(force: boolean): Promise<HealthCenterResponse> {
    const stored = this.repository.getLatest();
    if (!stored) {
      return createEmptyHealthCenter(["api unavailable"]);
    }

    const previousSummary = this.repository.getPreviousSnapshot(stored.snapshot.id);
    const cacheKey = `${stored.snapshot.id}:${previousSummary?.id ?? "none"}`;
    if (
      !force &&
      this.cached &&
      this.cached.key === cacheKey &&
      Date.now() - this.cached.generatedAt < 30_000
    ) {
      return this.cached.data;
    }

    const trendBundle = await loadTrendBundle(this.analysisService);
    const previous = previousSummary
      ? this.repository.getSnapshot(previousSummary.id)
      : undefined;
    const diff = previousSummary
      ? this.repository.diffSnapshots(stored.snapshot.id, previousSummary.id)
      : undefined;

    const sections = buildSections(stored, previous, diff, trendBundle, this.repository);
    const response: HealthCenterResponse = {
      generatedAt: new Date().toISOString(),
      degradedSources: Array.from(
        new Set([
          ...stored.snapshot.degradedSources,
          ...trendBundle.degradedSources,
        ]),
      ),
      summary: {
        criticalCount: sections.criticalNow.cards.length,
        emergingCount: sections.emergingProblems.cards.length,
        cleanupCount: sections.cleanupBacklog.cards.length,
        nodesUnderPressure: stored.snapshot.nodes.filter((node) => node.pressure.length > 0)
          .length,
        degradedDeployments: (stored.snapshot.deployments ?? []).filter(
          (deployment) => deployment.rolloutDegraded,
        ).length,
      },
      diffSummary: {
        snapshotId: stored.snapshot.id,
        previousSnapshotId: previousSummary?.id,
        previousCollectedAt: previousSummary?.collectedAt,
        added: diff?.added.length ?? 0,
        removed: diff?.removed.length ?? 0,
        changed: diff?.changed.length ?? 0,
      },
      ...sections,
    };

    this.cached = {
      key: cacheKey,
      generatedAt: Date.now(),
      data: response,
    };
    return response;
  }
}

async function loadTrendBundle(
  analysisService: AnalysisService,
): Promise<TrendBundle> {
  const [
    nodes1h,
    nodes6h,
    nodes24h,
    nodes7d,
    deployments1h,
    deployments6h,
    deployments24h,
    deployments7d,
  ] = await Promise.all([
    analysisService.listNodes("1h"),
    analysisService.listNodes("6h"),
    analysisService.listNodes("24h"),
    analysisService.listNodes("7d"),
    analysisService.listDeployments("1h"),
    analysisService.listDeployments("6h"),
    analysisService.listDeployments("24h"),
    analysisService.listDeployments("7d"),
  ]);

  return {
    nodes1h: nodes1h.nodes,
    nodes6h: nodes6h.nodes,
    nodes24h: nodes24h.nodes,
    nodes7d: nodes7d.nodes,
    deployments1h: deployments1h.deployments,
    deployments6h: deployments6h.deployments,
    deployments24h: deployments24h.deployments,
    deployments7d: deployments7d.deployments,
    degradedSources: [
      ...nodes1h.degradedSources,
      ...nodes6h.degradedSources,
      ...nodes24h.degradedSources,
      ...nodes7d.degradedSources,
      ...deployments1h.degradedSources,
      ...deployments6h.degradedSources,
      ...deployments24h.degradedSources,
      ...deployments7d.degradedSources,
    ],
  };
}

function buildSections(
  stored: StoredSnapshot,
  previous: StoredSnapshot | undefined,
  diff: ReturnType<SnapshotRepository["diffSnapshots"]>,
  trendBundle: TrendBundle,
  repository: SnapshotRepository,
): Pick<
  HealthCenterResponse,
  "criticalNow" | "emergingProblems" | "riskWatch" | "cleanupBacklog"
> {
  const cardsById = new Map<string, HealthCenterCard>();
  const issueCards = buildIssueCards(stored, previous, diff, repository);
  for (const card of issueCards) {
    cardsById.set(card.id, card);
  }

  for (const card of buildNodeHeuristics(stored, trendBundle, cardsById, repository)) {
    cardsById.set(card.id, card);
  }

  for (const card of buildDeploymentHeuristics(stored, trendBundle, cardsById, repository)) {
    cardsById.set(card.id, card);
  }

  const sections = {
    criticalNow: createSection(
      "criticalNow",
      "Criticos Agora",
      "O que esta quebrando ou perto de quebrar neste momento.",
    ),
    emergingProblems: createSection(
      "emergingProblems",
      "Novos Problemas",
      "Mudancas recentes, picos e degradacoes surgindo desde a coleta anterior.",
    ),
    riskWatch: createSection(
      "riskWatch",
      "Riscos para acompanhar",
      "Sinais importantes que ainda nao viraram incidente, mas merecem atencao.",
    ),
    cleanupBacklog: createSection(
      "cleanupBacklog",
      "Lixo operacional e inconsistencias",
      "Orfaos, restos de rollout, jobs antigos e configuracoes que sujam a operacao.",
    ),
  };

  for (const card of cardsById.values()) {
    if (card.category === "cleanup") {
      sections.cleanupBacklog.cards.push(card);
      continue;
    }
    if (card.severity === "critical" || card.severity === "high") {
      sections.criticalNow.cards.push(card);
      continue;
    }
    if (card.changedRecently || card.trend === "new" || card.trend === "worsened") {
      sections.emergingProblems.cards.push(card);
      continue;
    }
    sections.riskWatch.cards.push(card);
  }

  for (const section of Object.values(sections)) {
    section.cards.sort(sortCards);
  }

  return sections;
}

function buildIssueCards(
  stored: StoredSnapshot,
  previous: StoredSnapshot | undefined,
  diff: ReturnType<SnapshotRepository["diffSnapshots"]>,
  repository: SnapshotRepository,
) {
  const previousIssues = previous?.snapshot.issues ?? [];
  const diffKeys = new Set(diff?.changed.map((item) => item.resourceKey) ?? []);
  const previousSignatures = new Map(
    previousIssues.map((issue) => [issueSignature(issue), issue]),
  );

  return stored.snapshot.issues.map((issue) => {
    const resolved = resolvePrimaryResource(stored, issue.resourceRef);
    const resourceDetail = resolved?.detail;
    const resource = resolved?.ref ?? issue.resourceRef ?? { kind: "Namespace", name: "cluster" };
    const previousIssue = previousSignatures.get(issueSignature(issue));
    const trend = previousIssue
      ? severityRank(issue.severity) > severityRank(previousIssue.severity)
        ? "worsened"
        : "stable"
      : "new";
    const changedRecently =
      trend === "new" ||
      trend === "worsened" ||
      (resolved?.key ? diffKeys.has(resolved.key) : false);

    return {
      id: `issue:${issue.id}`,
      title: issue.title,
      severity: issue.severity,
      category: issue.category,
      resource,
      summary: issue.summary,
      whyNow: changedRecently
        ? "Este problema e novo ou piorou desde a coleta anterior."
        : "O problema segue presente nas ultimas coletas e ainda merece acao.",
      evidence: issue.evidence,
      recommendedAction: issue.recommendation,
      suggestedCommands: uniqueStrings([
        ...issue.suggestedCommands,
        ...(resourceDetail?.suggestedCommands ?? []),
      ]).slice(0, 8),
      relatedResources: resourceDetail
        ? buildRelatedResources(stored, resourceDetail).slice(0, 6)
        : [],
      changedRecently,
      startedAt: issue.detectedAt,
      trend,
      manifestYaml: resourceDetail?.manifestYaml,
      analysisTarget: buildAnalysisTarget(resource),
      scope: resolveScope(resourceDetail),
    } satisfies HealthCenterCard;
  });
}

function buildNodeHeuristics(
  stored: StoredSnapshot,
  trendBundle: TrendBundle,
  existing: Map<string, HealthCenterCard>,
  repository: SnapshotRepository,
) {
  const cards: HealthCenterCard[] = [];
  const nodes1h = new Map(trendBundle.nodes1h.map((node) => [node.name, node]));
  const nodes24h = new Map(trendBundle.nodes24h.map((node) => [node.name, node]));
  const nodes7d = new Map(trendBundle.nodes7d.map((node) => [node.name, node]));

  for (const node of stored.snapshot.nodes) {
    const key = `Node:${node.name}`;
    if (
      [...existing.values()].some(
        (card) =>
          card.resource.kind === "Node" &&
          card.resource.name === node.name &&
          (card.category === "capacity" || card.category === "availability"),
      )
    ) {
      continue;
    }

    const history1h = nodes1h.get(node.name)?.history;
    const history24h = nodes24h.get(node.name)?.history;
    const history7d = nodes7d.get(node.name)?.history;
    const detail = stored.detailsByKey[key];
    const cpuPeak = history1h?.cpu.max ?? history24h?.cpu.max ?? history7d?.cpu.max;
    const memoryPeak =
      history1h?.memory.max ?? history24h?.memory.max ?? history7d?.memory.max;
    const cpuTotal = node.capacity.cpu.total;
    const memoryTotal = node.capacity.memory.total;
    const cpuCritical =
      !!cpuTotal && cpuPeak !== undefined && cpuPeak / cpuTotal >= 0.85;
    const memoryCritical =
      !!memoryTotal && memoryPeak !== undefined && memoryPeak / memoryTotal >= 0.9;
    const worsened =
      (history1h?.cpu.avg ?? 0) > (history24h?.cpu.avg ?? 0) * 1.35 ||
      (history1h?.memory.avg ?? 0) > (history24h?.memory.avg ?? 0) * 1.2;

    if (node.pressure.length === 0 && !cpuCritical && !memoryCritical && !worsened) {
      continue;
    }

    cards.push({
      id: `node-health:${node.name}`,
      title:
        node.pressure.length > 0
          ? `Node ${node.name} com pressao`
          : `Node ${node.name} sob carga elevada`,
      severity:
        node.pressure.length > 0 || memoryCritical
          ? "critical"
          : cpuCritical
            ? "high"
            : "medium",
      category: node.pressure.length > 0 ? "availability" : "capacity",
      resource: { kind: "Node", name: node.name },
      summary:
        node.pressure.length > 0
          ? `Foram detectados sinais de pressao do kubelet: ${node.pressure.join(", ")}.`
          : "O historico recente mostra o node acima da linha media e com risco de perder folga.",
      whyNow: worsened
        ? "A carga das ultimas horas piorou em relacao ao padrao recente."
        : "O node esta perto do limite observado no historico e exige revisao.",
      evidence: [
        { label: "CPU atual", value: formatCpu(node.usage.cpuCores) },
        { label: "RAM atual", value: formatMemory(node.usage.memoryBytes) },
        { label: "CPU pico 1h", value: formatCpu(history1h?.cpu.max) },
        { label: "RAM pico 1h", value: formatMemory(history1h?.memory.max) },
      ].filter((item) => item.value !== "--"),
      recommendedAction:
        "Revise distribuicao dos workloads mais pesados, requests e limits, e confirme se ainda existe folga para crescimento e drenagem.",
      suggestedCommands: uniqueStrings([
        detail ? `kubectl describe node ${node.name}` : "",
        `kubectl top node ${node.name}`,
        ...(repository.getNodeAnalysis(node.name)?.reviewCommands ?? []),
      ]).slice(0, 6),
      relatedResources: detail ? buildRelatedResources(stored, detail).slice(0, 6) : [],
      changedRecently: worsened,
      startedAt: stored.snapshot.collectedAt,
      trend: worsened ? "worsened" : "stable",
      manifestYaml: detail?.manifestYaml,
      analysisTarget: {
        type: "node",
        name: node.name,
      },
      scope: "platform",
    });
  }

  return cards;
}

function buildDeploymentHeuristics(
  stored: StoredSnapshot,
  trendBundle: TrendBundle,
  existing: Map<string, HealthCenterCard>,
  repository: SnapshotRepository,
) {
  const cards: HealthCenterCard[] = [];
  const deployments1h = new Map(
    trendBundle.deployments1h.map((deployment) => [deployment.key, deployment]),
  );
  const deployments24h = new Map(
    trendBundle.deployments24h.map((deployment) => [deployment.key, deployment]),
  );
  const deployments7d = new Map(
    trendBundle.deployments7d.map((deployment) => [deployment.key, deployment]),
  );

  for (const deployment of stored.snapshot.deployments ?? []) {
    if (
      [...existing.values()].some(
        (card) =>
          card.resource.kind === "Deployment" &&
          card.resource.namespace === deployment.namespace &&
          card.resource.name === deployment.name,
      )
    ) {
      continue;
    }

    const history1h = deployments1h.get(deployment.key)?.history;
    const history24h = deployments24h.get(deployment.key)?.history;
    const history7d = deployments7d.get(deployment.key)?.history;
    const detail = stored.detailsByKey[deployment.key];
    const endpointsReady =
      detail?.exposure?.services.reduce(
        (total, service) => total + (service.readyEndpoints ?? 0),
        0,
      ) ?? 0;
    const endpointsTotal =
      detail?.exposure?.services.reduce(
        (total, service) => total + (service.totalEndpoints ?? 0),
        0,
      ) ?? 0;
    const hotCpu =
      (history1h?.cpu.max ?? 0) > (history7d?.cpu.avg ?? 0) * 1.8 &&
      (history1h?.cpu.max ?? 0) > 0.2;
    const hotMemory =
      (history1h?.memory.max ?? 0) > (history24h?.memory.avg ?? 0) * 1.35 &&
      (history1h?.memory.max ?? 0) > 256 * 1024 * 1024;

    if (!deployment.rolloutDegraded && !(endpointsTotal > 0 && endpointsReady === 0) && !hotCpu && !hotMemory) {
      continue;
    }

    cards.push({
      id: `deployment-health:${deployment.key}`,
      title: deployment.rolloutDegraded
        ? `Deployment ${deployment.name} com rollout degradado`
        : endpointsTotal > 0 && endpointsReady === 0
          ? `Deployment ${deployment.name} sem endpoint pronto`
          : `Deployment ${deployment.name} com pico recente`,
      severity:
        deployment.rolloutDegraded || (endpointsTotal > 0 && endpointsReady === 0)
          ? "high"
          : "medium",
      category:
        deployment.rolloutDegraded
          ? "rollout"
          : endpointsTotal > 0 && endpointsReady === 0
            ? "networking"
            : "capacity",
      resource: {
        kind: "Deployment",
        namespace: deployment.namespace,
        name: deployment.name,
      },
      summary:
        deployment.rolloutDegraded
          ? "O rollout atual nao esta completamente saudavel e merece verificacao imediata."
          : endpointsTotal > 0 && endpointsReady === 0
            ? "A cadeia service/endpoints deste deployment ficou sem backend pronto."
            : "O historico recente mostrou aceleracao de consumo acima da media do deployment.",
      whyNow:
        hotCpu || hotMemory
          ? "A ultima hora ficou acima da media recente e pode indicar pico ou regressao."
          : "A saude atual do deployment ficou abaixo do esperado para a cadeia de servico.",
      evidence: [
        { label: "Replicas", value: `${deployment.readyReplicas ?? 0}/${deployment.desiredReplicas ?? 0}` },
        { label: "Endpoints", value: endpointsTotal > 0 ? `${endpointsReady}/${endpointsTotal}` : "--" },
        { label: "CPU pico 1h", value: formatCpu(history1h?.cpu.max) },
        { label: "RAM pico 1h", value: formatMemory(history1h?.memory.max) },
      ].filter((item) => item.value !== "--"),
      recommendedAction:
        "Abra o deployment, valide rollout, endpoints, eventos, requests e limits, e confirme se o pico recente e esperado.",
      suggestedCommands: uniqueStrings([
        `kubectl -n ${deployment.namespace} rollout status deployment/${deployment.name}`,
        `kubectl -n ${deployment.namespace} describe deployment ${deployment.name}`,
        ...(repository.getDeploymentAnalysis(deployment.key)?.reviewCommands ?? []),
      ]).slice(0, 6),
      relatedResources: detail ? buildRelatedResources(stored, detail).slice(0, 6) : [],
      changedRecently: hotCpu || hotMemory,
      startedAt: stored.snapshot.collectedAt,
      trend: hotCpu || hotMemory ? "worsened" : "stable",
      manifestYaml: detail?.manifestYaml,
      analysisTarget: {
        type: "deployment",
        name: deployment.name,
        namespace: deployment.namespace,
      },
      scope: "application",
    });
  }

  return cards;
}

function resolvePrimaryResource(
  stored: StoredSnapshot,
  ref: ResourceRef | undefined,
): { ref: ResourceRef; key: string; detail?: ResourceDetail } | undefined {
  if (!ref) {
    return undefined;
  }

  let currentRef = ref;
  let currentKey = resourceKey(currentRef);
  let detail = stored.detailsByKey[currentKey];
  if (!detail) {
    return {
      ref,
      key: currentKey,
    };
  }

  if (ref.kind === "Pod") {
    const owner = detail.relations.find(
      (relation) => relation.type === "owns" && relation.toKey === currentKey,
    );
    if (owner) {
      const ownerRef = parseResourceKey(owner.fromKey);
      if (ownerRef.kind === "ReplicaSet") {
        const replicaSetDetail = stored.detailsByKey[owner.fromKey];
        const parent = replicaSetDetail?.relations.find(
          (relation) => relation.type === "owns" && relation.toKey === owner.fromKey,
        );
        if (parent) {
          currentRef = parseResourceKey(parent.fromKey);
          currentKey = parent.fromKey;
          detail = stored.detailsByKey[currentKey];
        }
      } else {
        currentRef = ownerRef;
        currentKey = owner.fromKey;
        detail = stored.detailsByKey[currentKey];
      }
    }
  }

  if (ref.kind === "ReplicaSet") {
    const parent = detail.relations.find(
      (relation) => relation.type === "owns" && relation.toKey === currentKey,
    );
    if (parent) {
      currentRef = parseResourceKey(parent.fromKey);
      currentKey = parent.fromKey;
      detail = stored.detailsByKey[currentKey];
    }
  }

  return {
    ref: currentRef,
    key: currentKey,
    detail,
  };
}

function buildRelatedResources(
  stored: StoredSnapshot,
  detail: ResourceDetail,
): HealthCenterRelatedResource[] {
  const resources: HealthCenterRelatedResource[] = [];
  const seen = new Set<string>();

  for (const relation of detail.relations) {
    const targetKey =
      relation.fromKey === detail.key ? relation.toKey : relation.fromKey;
    if (seen.has(targetKey)) {
      continue;
    }
    const related = stored.detailsByKey[targetKey];
    if (!related) {
      continue;
    }
    seen.add(targetKey);
    resources.push({
      kind: related.kind,
      name: related.name,
      namespace: related.namespace,
      status: related.status,
      manifestYaml: related.manifestYaml,
    });
  }

  return resources;
}

function buildAnalysisTarget(
  resource: ResourceRef,
): HealthCenterAnalysisTarget | undefined {
  if (resource.kind === "Deployment" && resource.namespace) {
    return {
      type: "deployment",
      name: resource.name,
      namespace: resource.namespace,
    };
  }
  if (resource.kind === "Node") {
    return {
      type: "node",
      name: resource.name,
    };
  }
  return undefined;
}

function resolveScope(detail: ResourceDetail | undefined): "application" | "platform" {
  if (!detail) {
    return "platform";
  }
  return detail.category === "cluster" ||
    detail.category === "identity" ||
    detail.category === "policy"
    ? "platform"
    : "application";
}

function createSection(
  id: HealthCenterSection["id"],
  title: string,
  description: string,
): HealthCenterSection {
  return {
    id,
    title,
    description,
    cards: [],
  };
}

function createEmptyHealthCenter(degradedSources: string[]): HealthCenterResponse {
  return {
    generatedAt: new Date(0).toISOString(),
    degradedSources,
    summary: {
      criticalCount: 0,
      emergingCount: 0,
      cleanupCount: 0,
      nodesUnderPressure: 0,
      degradedDeployments: 0,
    },
    diffSummary: {
      snapshotId: "unavailable",
      added: 0,
      removed: 0,
      changed: 0,
    },
    criticalNow: createSection(
      "criticalNow",
      "Criticos Agora",
      "Sem dados do cluster nesta coleta.",
    ),
    emergingProblems: createSection(
      "emergingProblems",
      "Novos Problemas",
      "Sem dados do cluster nesta coleta.",
    ),
    riskWatch: createSection(
      "riskWatch",
      "Riscos para acompanhar",
      "Sem dados do cluster nesta coleta.",
    ),
    cleanupBacklog: createSection(
      "cleanupBacklog",
      "Lixo operacional e inconsistencias",
      "Sem dados do cluster nesta coleta.",
    ),
  };
}

function issueSignature(issue: Issue) {
  const resource = issue.resourceRef
    ? `${issue.resourceRef.kind}:${issue.resourceRef.namespace ?? "_cluster"}:${issue.resourceRef.name}`
    : "cluster";
  return `${resource}:${issue.category}:${issue.title}`;
}

function severityRank(severity: Severity) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function sortCards(left: HealthCenterCard, right: HealthCenterCard) {
  return (
    severityRank(right.severity) - severityRank(left.severity) ||
    Number(right.changedRecently) - Number(left.changedRecently) ||
    left.title.localeCompare(right.title)
  );
}

function resourceKey(ref: ResourceRef) {
  return ref.namespace
    ? `${ref.kind}:${ref.namespace}/${ref.name}`
    : `${ref.kind}:${ref.name}`;
}

function parseResourceKey(key: string): ResourceRef {
  const [kind, rest = ""] = key.split(":");
  const [namespace, name] = rest.includes("/") ? rest.split("/") : [undefined, rest];
  return {
    kind: kind as ResourceKind,
    namespace,
    name,
  };
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))];
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
