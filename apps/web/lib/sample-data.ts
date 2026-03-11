import type { AnalysisRunResponse, Issue } from "@k8s-ai-mvp/shared";
import type {
  ClusterSnapshot,
  DeploymentInventory,
  NamespaceInventory,
  ResourceDetail,
  ResourceKind,
  ResourceRelation,
  SnapshotDiff
} from "./explorer-types";

export const sampleAnalysisResponse: AnalysisRunResponse = {
  degradedSources: ["k8sgpt"],
  snapshot: {
    overview: {
      clusterName: "intesys-prod",
      collectedAt: "2026-03-11T16:00:00.000Z",
      nodeCount: 6,
      namespaceCount: 14,
      podCount: 182,
      unhealthyPodCount: 9,
      totalRestarts: 47,
      usage: {
        cpuCores: 18.4,
        cpuPercent: 74,
        memoryBytes: 12884901888,
        memoryPercent: 68
      },
      topNamespaces: [
        {
          name: "payments",
          podCount: 24,
          unhealthyPodCount: 3,
          restartCount: 12,
          cpuCores: 4.1,
          memoryBytes: 3221225472
        },
        {
          name: "core-api",
          podCount: 31,
          unhealthyPodCount: 1,
          restartCount: 8,
          cpuCores: 3.6,
          memoryBytes: 2415919104
        },
        {
          name: "observability",
          podCount: 16,
          unhealthyPodCount: 0,
          restartCount: 2,
          cpuCores: 2.3,
          memoryBytes: 2147483648
        }
      ],
      topRestarts: [
        {
          name: "payments-worker-6dffb4f7d7-4vw6p",
          namespace: "payments",
          phase: "Running",
          nodeName: "worker-03",
          restarts: 11,
          ready: true,
          reason: "OOMKilled",
          cpuCores: 0.9,
          memoryBytes: 734003200,
          missingResources: true
        },
        {
          name: "gateway-api-7759dcbbbc-2g8hf",
          namespace: "core-api",
          phase: "Running",
          nodeName: "worker-02",
          restarts: 7,
          ready: true,
          reason: "CrashLoopBackOff",
          cpuCores: 0.7,
          memoryBytes: 629145600,
          missingResources: false
        },
        {
          name: "billing-sync-5fb9876759-xghg2",
          namespace: "payments",
          phase: "Pending",
          nodeName: "worker-03",
          restarts: 5,
          ready: false,
          reason: "Unschedulable",
          cpuCores: 0.4,
          memoryBytes: 314572800,
          missingResources: true
        }
      ],
      highlightedIssues: []
    },
    nodes: [
      {
        name: "worker-01",
        status: "Ready",
        roles: ["worker"],
        taints: [],
        usage: {
          cpuCores: 2.9,
          cpuPercent: 61,
          memoryBytes: 2147483648,
          memoryPercent: 54
        },
        capacity: {
          cpu: { total: 4, used: 2.9, available: 1.1 },
          memory: { total: 4294967296, used: 2147483648, available: 2147483648 },
          storage: { total: 21474836480, used: 8589934592, available: 12884901888 }
        },
        pressure: [],
        podCount: 26,
        workloads: [
          {
            key: "Deployment:core-api/core-api",
            kind: "Deployment",
            name: "core-api",
            namespace: "core-api",
            cpuCores: 0.9,
            memoryBytes: 734003200,
            replicas: 3,
            readyReplicas: 3,
            restartCount: 1,
            issueCount: 0
          },
          {
            key: "StatefulSet:core-api/redis-cache",
            kind: "StatefulSet",
            name: "redis-cache",
            namespace: "core-api",
            cpuCores: 0.6,
            memoryBytes: 524288000,
            replicas: 1,
            readyReplicas: 1,
            restartCount: 0,
            issueCount: 0
          },
          {
            key: "Deployment:observability/loki",
            kind: "Deployment",
            name: "loki",
            namespace: "observability",
            cpuCores: 0.3,
            memoryBytes: 314572800,
            replicas: 1,
            readyReplicas: 1,
            restartCount: 0,
            issueCount: 0
          }
        ],
        topWorkloads: [
          {
            kind: "Deployment",
            key: "Deployment:core-api/core-api",
            name: "core-api",
            namespace: "core-api",
            cpuCores: 0.9,
            memoryBytes: 734003200,
            replicas: 3,
            readyReplicas: 3,
            restartCount: 1,
            issueCount: 0
          },
          {
            kind: "StatefulSet",
            key: "StatefulSet:core-api/redis-cache",
            name: "redis-cache",
            namespace: "core-api",
            cpuCores: 0.6,
            memoryBytes: 524288000,
            replicas: 1,
            readyReplicas: 1,
            restartCount: 0,
            issueCount: 0
          }
        ]
      },
      {
        name: "worker-03",
        status: "Ready",
        roles: ["worker"],
        taints: ["dedicated=payments:NoSchedule"],
        usage: {
          cpuCores: 4.8,
          cpuPercent: 82,
          memoryBytes: 4294967296,
          memoryPercent: 87
        },
        capacity: {
          cpu: { total: 6, used: 4.8, available: 1.2 },
          memory: { total: 8589934592, used: 4294967296, available: 4294967296 },
          storage: { total: 32212254720, used: undefined, available: undefined }
        },
        pressure: ["memory", "pid"],
        podCount: 34,
        workloads: [
          {
            key: "Deployment:payments/payments-worker",
            kind: "Deployment",
            name: "payments-worker",
            namespace: "payments",
            cpuCores: 1.8,
            memoryBytes: 1363148800,
            replicas: 3,
            readyReplicas: 2,
            restartCount: 11,
            issueCount: 3
          },
          {
            key: "Job:payments/billing-sync",
            kind: "Job",
            name: "billing-sync",
            namespace: "payments",
            cpuCores: 1.1,
            memoryBytes: 943718400,
            restartCount: 5,
            issueCount: 2
          },
          {
            key: "Deployment:payments/payments-api",
            kind: "Deployment",
            name: "payments-api",
            namespace: "payments",
            cpuCores: 0.8,
            memoryBytes: 734003200,
            replicas: 2,
            readyReplicas: 2,
            restartCount: 0,
            issueCount: 0
          }
        ],
        topWorkloads: [
          {
            kind: "Deployment",
            key: "Deployment:payments/payments-worker",
            name: "payments-worker",
            namespace: "payments",
            cpuCores: 1.8,
            memoryBytes: 1363148800,
            replicas: 3,
            readyReplicas: 2,
            restartCount: 11,
            issueCount: 3
          },
          {
            kind: "Job",
            key: "Job:payments/billing-sync",
            name: "billing-sync",
            namespace: "payments",
            cpuCores: 1.1,
            memoryBytes: 943718400,
            restartCount: 5,
            issueCount: 2
          }
        ]
      }
    ],
    namespaces: [
      {
        name: "payments",
        podCount: 24,
        unhealthyPodCount: 3,
        restartCount: 12,
        cpuCores: 4.1,
        memoryBytes: 3221225472
      },
      {
        name: "core-api",
        podCount: 31,
        unhealthyPodCount: 1,
        restartCount: 8,
        cpuCores: 3.6,
        memoryBytes: 2415919104
      }
    ],
    pods: [
      {
        name: "payments-worker-6dffb4f7d7-4vw6p",
        namespace: "payments",
        phase: "Running",
        nodeName: "worker-03",
        restarts: 11,
        ready: true,
        reason: "OOMKilled",
        cpuCores: 0.9,
        memoryBytes: 734003200,
        missingResources: true
      }
    ],
    issues: [
      {
        id: "issue-oom-payments",
        title: "Worker de pagamentos sem requests/limits adequados",
        severity: "high",
        category: "capacity",
        source: "rule",
        resourceRef: {
          kind: "Deployment",
          namespace: "payments",
          name: "payments-worker"
        },
        summary:
          "O workload concentra reinicios por OOMKilled e nao declara limites consistentes para memoria.",
        evidence: [
          { label: "restarts", value: "11" },
          { label: "reason", value: "OOMKilled" }
        ],
        recommendation:
          "Definir requests/limits com base no uso real e redistribuir consumo no namespace.",
        playbook: [
          {
            title: "Validar uso atual",
            detail:
              "Comparar uso de memoria dos ultimos 24h com os limites atuais do deployment."
          },
          {
            title: "Ajustar recursos",
            detail:
              "Atualizar requests/limits do deployment e revisar HPA se existir."
          }
        ],
        suggestedCommands: [
          "kubectl -n payments top pod | sort -k3 -hr | head",
          "kubectl -n payments describe deploy payments-worker"
        ],
        detectedAt: "2026-03-11T16:00:00.000Z"
      },
      {
        id: "issue-node-pressure",
        title: "Node worker-03 com pressao de memoria",
        severity: "medium",
        category: "availability",
        source: "prometheus",
        resourceRef: {
          kind: "Node",
          name: "worker-03",
          nodeName: "worker-03"
        },
        summary:
          "O node esta acima de 85% de memoria e concentra pods com comportamento instavel.",
        evidence: [
          { label: "memory_percent", value: "87%" },
          { label: "affected_pods", value: "6" }
        ],
        recommendation:
          "Realocar workloads pesados ou expandir capacidade antes de um pico de carga.",
        playbook: [
          {
            title: "Verificar hotspots",
            detail:
              "Listar pods com maior uso e confirmar se ha requests abaixo do padrao."
          }
        ],
        suggestedCommands: [
          "kubectl top pod -A --sort-by=memory | head -20",
          "kubectl describe node worker-03"
        ],
        detectedAt: "2026-03-11T16:00:00.000Z"
      },
      {
        id: "issue-endpoints-core-api",
        title: "Service core-api sem endpoints completos",
        severity: "medium",
        category: "networking",
        source: "k8sgpt",
        resourceRef: {
          kind: "Service",
          namespace: "core-api",
          name: "core-api"
        },
        summary:
          "O service de entrada do namespace core-api perdeu parte dos endpoints apos rollout parcial.",
        evidence: [
          { label: "ready_endpoints", value: "2/4" },
          { label: "ingress", value: "core-api-public" }
        ],
        recommendation:
          "Revisar o rollout do deployment e confirmar readiness probes antes de expor o trafego.",
        playbook: [
          {
            title: "Checar endpoints",
            detail:
              "Comparar os pods prontos com os endpoints registrados no service."
          }
        ],
        suggestedCommands: [
          "kubectl -n core-api get endpoints core-api -o wide",
          "kubectl -n core-api describe ingress core-api-public"
        ],
        detectedAt: "2026-03-11T16:00:00.000Z"
      },
      {
        id: "issue-rollout-payments",
        title: "Rollout do payments-worker travado na revisao atual",
        severity: "high",
        category: "rollout",
        source: "rule",
        resourceRef: {
          kind: "Deployment",
          namespace: "payments",
          name: "payments-worker"
        },
        summary:
          "A revisao nova nao completou a troca de replicas e parte dos pods continua indisponivel.",
        evidence: [
          { label: "updated", value: "2/3" },
          { label: "condition", value: "Progressing=False" }
        ],
        recommendation:
          "Inspecionar readiness, eventos do ReplicaSet atual e o atraso entre updated e available replicas.",
        playbook: [
          {
            title: "Revisar rollout",
            detail: "Conferir a condicao Progressing, os eventos mais recentes e a revisao em rollout."
          }
        ],
        suggestedCommands: [
          "kubectl -n payments rollout status deploy/payments-worker",
          "kubectl -n payments describe rs payments-worker-7cb9d7f5c4"
        ],
        detectedAt: "2026-03-11T16:00:00.000Z"
      },
      {
        id: "issue-cleanup-payments",
        title: "ReplicaSet antigo do payments-worker segue acumulado",
        severity: "info",
        category: "cleanup",
        source: "rule",
        resourceRef: {
          kind: "Deployment",
          namespace: "payments",
          name: "payments-worker"
        },
        summary:
          "Uma revisao antiga do deployment ainda aparece no namespace sem trafego nem pods ativos.",
        evidence: [
          { label: "replicaset", value: "payments-worker-5ffcc7c9b8" },
          { label: "pods", value: "0" }
        ],
        recommendation:
          "Confirmar se a revisao ja pode ser removida ou se o historico do deployment deve ser reduzido.",
        playbook: [
          {
            title: "Validar historico de rollout",
            detail: "Comparar revisoes ativas do deployment e revisar se o ReplicaSet antigo ainda faz sentido."
          }
        ],
        suggestedCommands: [
          "kubectl -n payments rollout history deploy/payments-worker",
          "kubectl -n payments get rs -l app=payments-worker"
        ],
        detectedAt: "2026-03-11T16:00:00.000Z"
      }
    ]
  }
};

sampleAnalysisResponse.snapshot.overview.highlightedIssues =
  sampleAnalysisResponse.snapshot.issues.slice(0, 2);

export const sampleChatPrompts = [
  "Quais pods estao reiniciando mais agora?",
  "Quais namespaces concentram mais memoria?",
  "Tem deployment sem requests ou limits?",
  "Quais nodes estao mais carregados?"
];

const paymentsIssues = sampleAnalysisResponse.snapshot.issues.filter(
  (issue) => issue.resourceRef?.namespace === "payments"
);
const coreApiIssues = sampleAnalysisResponse.snapshot.issues.filter(
  (issue) => issue.resourceRef?.namespace === "core-api"
);

export const sampleNamespaces: NamespaceInventory[] = [
  {
    name: "payments",
    status: "critical",
    summary: "Namespace com jobs falhos, memoria pressionada e playbooks abertos.",
    podCount: 24,
    resourceCount: 19,
    unhealthyResourceCount: 4,
    issueCount: paymentsIssues.length,
    cpuCores: 4.1,
    memoryBytes: 3221225472,
    kinds: [
      { kind: "Deployment", count: 4 },
      { kind: "ReplicaSet", count: 2 },
      { kind: "HorizontalPodAutoscaler", count: 1 },
      { kind: "Service", count: 3 },
      { kind: "EndpointSlice", count: 2 },
      { kind: "PodDisruptionBudget", count: 1 },
      { kind: "ServiceAccount", count: 1 },
      { kind: "Job", count: 2 },
      { kind: "ConfigMap", count: 4 },
      { kind: "PersistentVolumeClaim", count: 1 }
    ],
    resources: [
      {
        kind: "Deployment",
        name: "payments-worker",
        namespace: "payments",
        status: "Degraded",
        health: "critical",
        summary: "Reinicios por OOM e requests/limits incompletos.",
        ready: 2,
        desired: 3,
        issueCount: 4,
        cpuCores: 1.8,
        memoryBytes: 1363148800,
        labels: ["app=payments-worker", "tier=worker"],
        scope: "application"
      },
      {
        kind: "HorizontalPodAutoscaler",
        name: "payments-worker",
        namespace: "payments",
        status: "At max replicas",
        health: "warning",
        summary: "HPA ativo, mas ja encostando no maxReplicas.",
        issueCount: 1,
        scope: "application"
      },
      {
        kind: "Service",
        name: "payments-api",
        namespace: "payments",
        status: "Healthy",
        health: "healthy",
        summary: "Service principal do namespace, com trafego do ingress.",
        issueCount: 0,
        labels: ["exposure=internal"],
        scope: "application"
      },
      {
        kind: "Job",
        name: "billing-sync",
        namespace: "payments",
        status: "Failing",
        health: "warning",
        summary: "Job de sincronizacao com falhas intermitentes na ultima janela.",
        issueCount: 1,
        cpuCores: 1.1,
        memoryBytes: 943718400,
        scope: "application"
      },
      {
        kind: "ConfigMap",
        name: "payments-worker-config",
        namespace: "payments",
        status: "Mounted",
        health: "healthy",
        summary: "Configuracao do worker referenciada pelos pods ativos.",
        issueCount: 0,
        scope: "application"
      }
    ],
    issues: paymentsIssues
  },
  {
    name: "core-api",
    status: "warning",
    summary: "Namespace estavel, mas com service parcialmente degradado apos rollout.",
    podCount: 31,
    resourceCount: 27,
    unhealthyResourceCount: 2,
    issueCount: coreApiIssues.length,
    cpuCores: 3.6,
    memoryBytes: 2415919104,
    kinds: [
      { kind: "Deployment", count: 5 },
      { kind: "StatefulSet", count: 1 },
      { kind: "Service", count: 4 },
      { kind: "Ingress", count: 1 },
      { kind: "ConfigMap", count: 5 }
    ],
    resources: [
      {
        kind: "Deployment",
        name: "core-api",
        namespace: "core-api",
        status: "Healthy",
        health: "healthy",
        summary: "API principal com rollout em progresso controlado.",
        ready: 4,
        desired: 4,
        issueCount: 0,
        cpuCores: 0.9,
        memoryBytes: 734003200,
        labels: ["app=core-api"],
        scope: "application"
      },
      {
        kind: "Service",
        name: "core-api",
        namespace: "core-api",
        status: "Partial endpoints",
        health: "warning",
        summary: "Apenas parte dos endpoints esta pronta para trafego.",
        issueCount: 1,
        scope: "application"
      },
      {
        kind: "Ingress",
        name: "core-api-public",
        namespace: "core-api",
        status: "Active",
        health: "healthy",
        summary: "Entrada publica para o service core-api.",
        issueCount: 0,
        scope: "application"
      }
    ],
    issues: coreApiIssues
  },
  {
    name: "observability",
    status: "healthy",
    summary: "Stack de observabilidade com sinais limpos e historico consistente.",
    podCount: 16,
    resourceCount: 22,
    unhealthyResourceCount: 0,
    issueCount: 0,
    cpuCores: 2.3,
    memoryBytes: 2147483648,
    kinds: [
      { kind: "Deployment", count: 3 },
      { kind: "Service", count: 4 },
      { kind: "Ingress", count: 1 },
      { kind: "ConfigMap", count: 6 }
    ],
    resources: [
      {
        kind: "Deployment",
        name: "grafana",
        namespace: "observability",
        status: "Healthy",
        health: "healthy",
        summary: "Painel principal com replicas prontas.",
        ready: 2,
        desired: 2,
        issueCount: 0,
        cpuCores: 0.5,
        memoryBytes: 402653184,
        scope: "platform"
      }
    ],
    issues: []
  }
];

export const sampleSnapshots: ClusterSnapshot[] = [
  {
    id: "snap-20260311-1600",
    clusterName: "intesys-prod",
    collectedAt: "2026-03-11T16:00:00.000Z",
    namespaceCount: 14,
    resourceCount: 287,
    issueCount: 32,
    changeCount: 7
  },
  {
    id: "snap-20260311-1400",
    clusterName: "intesys-prod",
    collectedAt: "2026-03-11T14:00:00.000Z",
    namespaceCount: 14,
    resourceCount: 285,
    issueCount: 28,
    changeCount: 5
  },
  {
    id: "snap-20260311-1200",
    clusterName: "intesys-prod",
    collectedAt: "2026-03-11T12:00:00.000Z",
    namespaceCount: 14,
    resourceCount: 284,
    issueCount: 26,
    changeCount: 3
  }
];

const sampleRelations: ResourceRelation[] = [
  {
    type: "owns",
    direction: "outgoing",
    target: {
      kind: "ReplicaSet",
      namespace: "payments",
      name: "payments-worker-7cb9d7f5c4"
    },
    title: "ReplicaSet ativo",
    detail: "Revisao atual do rollout, responsavel pelos pods atualizados."
  },
  {
    type: "owns",
    direction: "outgoing",
    target: {
      kind: "Pod",
      namespace: "payments",
      name: "payments-worker-6dffb4f7d7-4vw6p"
    },
    title: "Replica ativa",
    detail: "Pod com maior consumo do deployment e historico recente de OOMKilled."
  },
  {
    type: "backs-service",
    direction: "outgoing",
    target: {
      kind: "Service",
      namespace: "payments",
      name: "payments-api"
    },
    title: "Atende o service principal",
    detail: "Os pods prontos do deployment compoem os endpoints do service payments-api."
  },
  {
    type: "backs",
    direction: "outgoing",
    target: {
      kind: "EndpointSlice",
      namespace: "payments",
      name: "payments-api-x92lt"
    },
    title: "Endpoints reais do trafego",
    detail: "EndpointSlice atual com 2 endpoints prontos de 3 esperados."
  },
  {
    type: "exposes",
    direction: "outgoing",
    target: {
      kind: "Ingress",
      namespace: "payments",
      name: "payments-api-public"
    },
    title: "Recebe trafego via ingress",
    detail: "Ingress publico direciona requisicoes HTTP para o service payments-api."
  },
  {
    type: "scales",
    direction: "incoming",
    target: {
      kind: "HorizontalPodAutoscaler",
      namespace: "payments",
      name: "payments-worker"
    },
    title: "Escalado por HPA",
    detail: "HPA observa CPU e memoria e ajusta replicas do deployment."
  },
  {
    type: "references-config",
    direction: "outgoing",
    target: {
      kind: "ConfigMap",
      namespace: "payments",
      name: "payments-worker-config"
    },
    title: "Le configuracao",
    detail: "ConfigMap montado via volume e lido no boot do worker."
  },
  {
    type: "references-secret",
    direction: "outgoing",
    target: {
      kind: "Secret",
      namespace: "payments",
      name: "payments-worker-secrets"
    },
    title: "Consome segredo",
    detail: "Secret referenciado por envFrom, sem leitura do conteudo sensivel."
  },
  {
    type: "claims-storage",
    direction: "outgoing",
    target: {
      kind: "PersistentVolumeClaim",
      namespace: "payments",
      name: "payments-worker-cache"
    },
    title: "Usa cache persistente",
    detail: "PVC montado em /var/cache para fila local e checkpoints."
  },
  {
    type: "protects",
    direction: "incoming",
    target: {
      kind: "PodDisruptionBudget",
      namespace: "payments",
      name: "payments-worker-pdb"
    },
    title: "Protegido por PDB",
    detail: "PDB exige disponibilidade minima durante drains e manutencoes."
  },
  {
    type: "uses-account",
    direction: "outgoing",
    target: {
      kind: "ServiceAccount",
      namespace: "payments",
      name: "payments-worker"
    },
    title: "Roda com service account dedicada",
    detail: "Workload usa uma service account propria para consumo de filas internas."
  }
];

export const sampleResourceDetails: ResourceDetail[] = [
  {
    resource: {
      kind: "Deployment",
      name: "payments-worker",
      namespace: "payments",
      status: "Degraded",
      health: "critical",
      summary: "Deployment central de processamento com replicas abaixo do desejado.",
      ready: 2,
      desired: 3,
      issueCount: 4,
      cpuCores: 1.8,
      memoryBytes: 1363148800,
      labels: ["app=payments-worker", "tier=worker"],
      scope: "application",
      createdAt: "2026-02-18T10:42:00.000Z"
    },
    metrics: {
      cpuCores: 1.8,
      memoryBytes: 1363148800,
      restartCount: 11
    },
    insights: [
      "3 replicas desejadas, mas apenas 2 prontas nesta coleta.",
      "O deployment esta exposto por Service e Ingress com endpoints parciais.",
      "Existe HPA ativo observando CPU e memoria."
    ],
    references: [
      {
        kind: "ConfigMap",
        name: "payments-worker-config",
        namespace: "payments"
      },
      {
        kind: "Secret",
        name: "payments-worker-secrets",
        namespace: "payments"
      },
      {
        kind: "PersistentVolumeClaim",
        name: "payments-worker-cache",
        namespace: "payments"
      }
    ],
    rollout: {
      desiredReplicas: 3,
      readyReplicas: 2,
      updatedReplicas: 3,
      availableReplicas: 2,
      unavailableReplicas: 1,
      paused: false,
      progressing: false,
      currentRevision: "17",
      updatedRevision: "18",
      conditions: [
        {
          type: "Progressing",
          status: "False",
          reason: "ProgressDeadlineExceeded",
          message: "Novo ReplicaSet nao conseguiu deixar todas as replicas disponiveis."
        },
        {
          type: "Available",
          status: "False",
          reason: "MinimumReplicasUnavailable",
          message: "Uma replica segue indisponivel apos as ultimas tentativas de rollout."
        }
      ],
      events: [
        {
          type: "Warning",
          reason: "Unhealthy",
          message: "Readiness probe falhou para um dos pods do rollout novo.",
          lastSeen: "2026-03-11T15:57:00.000Z"
        }
      ]
    },
    autoscaling: {
      enabled: true,
      sourceKind: "HorizontalPodAutoscaler",
      name: "payments-worker",
      namespace: "payments",
      minReplicas: 2,
      maxReplicas: 6,
      currentReplicas: 3,
      desiredReplicas: 4,
      targetKind: "Deployment",
      targetName: "payments-worker",
      cpuTargetUtilization: 70,
      currentCpuUtilization: 81,
      memoryTargetUtilization: 75,
      currentMemoryUtilization: 79,
      atMaxReplicas: false,
      conditions: [
        {
          type: "AbleToScale",
          status: "True",
          reason: "ReadyForNewScale",
          message: "HPA apto a ajustar replicas."
        }
      ]
    },
    exposure: {
      services: [
        {
          name: "payments-api",
          namespace: "payments",
          type: "ClusterIP",
          ports: ["8080/TCP"],
          selector: "app=payments-worker",
          endpointSlices: [
            {
              name: "payments-api-7z8hd",
              readyEndpoints: 2,
              totalEndpoints: 3
            }
          ]
        }
      ],
      ingresses: [
        {
          name: "payments-api-public",
          namespace: "payments",
          ingressClassName: "nginx",
          hosts: ["payments.intesys.local"],
          tlsSecrets: ["payments-api-tls"],
          backendServices: ["payments-api"]
        }
      ]
    },
    scheduling: {
      serviceAccountName: "payments-worker",
      imagePullSecrets: ["regcred-intesys"],
      nodeSelector: ["workload=payments"],
      tolerations: ["dedicated=payments:NoSchedule"],
      affinitySummary: ["Preferencia por separar replicas em nodes diferentes."],
      topologySpread: ["zone maxSkew=1 whenUnsatisfiable=ScheduleAnyway"]
    },
    resilience: {
      hasReadinessProbe: true,
      hasLivenessProbe: true,
      hasStartupProbe: false,
      podDisruptionBudgets: [
        {
          name: "payments-worker-pdb",
          namespace: "payments",
          minAvailable: "2",
          disruptionsAllowed: 0
        }
      ],
      hasPodDisruptionBudget: true,
      hasAntiAffinity: true,
      risks: [
        "Uso de CPU acima do target do HPA e rollout ainda instavel.",
        "Sem startup probe, o pod fica mais sensivel a picos de inicializacao."
      ]
    },
    cleanupSignals: [
      "ReplicaSet payments-worker-5ffcc7c9b8 continua sem pods ativos.",
      "Existe um Service com endpoints parciais apos o ultimo rollout."
    ],
    events: [
      {
        type: "Warning",
        reason: "BackOff",
        message: "Container reiniciou repetidamente apos falha de readiness.",
        count: 4,
        lastSeen: "2026-03-11T15:58:00.000Z"
      }
    ],
    issues: paymentsIssues,
    suggestedCommands: [
      "kubectl -n payments describe deploy payments-worker",
      "kubectl -n payments get pods -l app=payments-worker -o wide",
      "kubectl -n payments top pod -l app=payments-worker",
      "kubectl -n payments get endpointslice -l kubernetes.io/service-name=payments-api"
    ],
    relations: sampleRelations,
    history: [
      {
        id: "payments-worker-appeared",
        timestamp: "2026-02-18T10:42:00.000Z",
        changeType: "appeared",
        title: "Workload entrou no inventario",
        detail: "Primeiro snapshot local com o deployment payments-worker."
      },
      {
        id: "payments-worker-status",
        timestamp: "2026-03-11T14:00:00.000Z",
        changeType: "status",
        title: "Replicas prontas cairam de 3 para 2",
        detail: "Um pod passou a reiniciar apos aumento de carga e consumo de memoria."
      },
      {
        id: "payments-worker-spec",
        timestamp: "2026-03-11T16:00:00.000Z",
        changeType: "spec",
        title: "Requests seguem incompletos",
        detail: "O diff de spec detectou variacao de env, mas sem ajuste de limits."
      }
    ]
  },
  {
    resource: {
      kind: "Service",
      name: "core-api",
      namespace: "core-api",
      status: "Partial endpoints",
      health: "warning",
      summary: "Service de entrada com apenas parte dos backends prontos.",
      issueCount: 1,
      scope: "application",
      createdAt: "2026-01-20T08:00:00.000Z"
    },
    metrics: {
      cpuCores: 0.2,
      memoryBytes: 104857600
    },
    insights: [
      "Service com backends parciais e dependencia direta do ingress publico."
    ],
    references: [],
    issues: coreApiIssues,
    suggestedCommands: [
      "kubectl -n core-api get endpoints core-api -o wide",
      "kubectl -n core-api describe service core-api"
    ],
    relations: [
      {
        type: "served-by",
        direction: "incoming",
        target: {
          kind: "Deployment",
          namespace: "core-api",
          name: "core-api"
        },
        title: "Recebe pods do deployment",
        detail: "Os selectors do service batem no rollout principal da API."
      },
      {
        type: "fronted-by",
        direction: "incoming",
        target: {
          kind: "Ingress",
          namespace: "core-api",
          name: "core-api-public"
        },
        title: "Exposto pelo ingress",
        detail: "Ingress principal encaminha trafego HTTP para este service."
      }
    ],
    history: [
      {
        id: "core-api-service-status",
        timestamp: "2026-03-11T16:00:00.000Z",
        changeType: "status",
        title: "Endpoints prontos reduziram para 2/4",
        detail: "Snapshot atual aponta rollout parcial com readiness ainda estabilizando."
      }
    ]
  }
];

export const sampleDeploymentInventories: DeploymentInventory[] = [
  {
    key: "Deployment:payments/payments-worker",
    name: "payments-worker",
    namespace: "payments",
    status: "Degraded",
    health: "critical",
    desiredReplicas: 3,
    readyReplicas: 2,
    updatedReplicas: 3,
    availableReplicas: 2,
    rolloutDegraded: true,
    autoscaling: sampleResourceDetails[0].autoscaling,
    exposure: sampleResourceDetails[0].exposure,
    resilience: sampleResourceDetails[0].resilience,
    references: sampleResourceDetails[0].references,
    cleanupSignals: sampleResourceDetails[0].cleanupSignals ?? [],
    topIssues: sampleResourceDetails[0].issues.slice(0, 3),
    suggestedCommands: sampleResourceDetails[0].suggestedCommands
  },
  {
    key: "Deployment:core-api/core-api",
    name: "core-api",
    namespace: "core-api",
    status: "Healthy",
    health: "healthy",
    desiredReplicas: 3,
    readyReplicas: 3,
    updatedReplicas: 3,
    availableReplicas: 3,
    rolloutDegraded: false,
    autoscaling: {
      enabled: false,
      atMaxReplicas: false,
      conditions: []
    },
    exposure: {
      services: [
        {
          name: "core-api",
          namespace: "core-api",
          type: "ClusterIP",
          ports: ["8080/TCP"],
          selector: "app=core-api",
          readyEndpoints: 3,
          totalEndpoints: 3,
          endpointSlices: [
            {
              name: "core-api-2k3hg",
              readyEndpoints: 3,
              totalEndpoints: 3,
              backingPods: ["core-api-7789dd9bf9-abcde", "core-api-7789dd9bf9-fghij", "core-api-7789dd9bf9-klmno"]
            }
          ]
        }
      ],
      ingresses: [
        {
          name: "core-api-public",
          namespace: "core-api",
          ingressClassName: "nginx",
          hosts: ["api.intesys.local"],
          tlsSecrets: ["core-api-tls"],
          backendServices: ["core-api"]
        }
      ]
    },
    resilience: {
      hasReadinessProbe: true,
      hasLivenessProbe: true,
      hasStartupProbe: false,
      podDisruptionBudgets: [],
      hasPodDisruptionBudget: false,
      hasAntiAffinity: false,
      risks: []
    },
    references: [
      { kind: "ConfigMap", name: "core-api-config", namespace: "core-api" },
      { kind: "Secret", name: "core-api-secrets", namespace: "core-api" }
    ],
    cleanupSignals: [],
    topIssues: [],
    suggestedCommands: [
      "kubectl describe deployment core-api -n core-api",
      "kubectl get endpointslice -n core-api -l kubernetes.io/service-name=core-api"
    ]
  }
];

export const sampleSnapshotDiffs: SnapshotDiff[] = [
  {
    currentSnapshotId: "snap-20260311-1600",
    previousSnapshotId: "snap-20260311-1400",
    generatedAt: "2026-03-11T16:02:00.000Z",
    summary: {
      added: 2,
      removed: 1,
      changed: 4
    },
    changes: [
      {
        changeType: "changed",
        resource: {
          kind: "Deployment",
          namespace: "payments",
          name: "payments-worker"
        },
        detail: "Replicas prontas cairam de 3 para 2 e os restarts subiram para 11."
      },
      {
        changeType: "changed",
        resource: {
          kind: "Service",
          namespace: "core-api",
          name: "core-api"
        },
        detail: "Endpoints prontos reduziram de 4 para 2 durante o rollout."
      },
      {
        changeType: "added",
        resource: {
          kind: "Job",
          namespace: "payments",
          name: "reconciliation-backfill"
        },
        detail: "Novo job criado para recompor pendencias do dia."
      },
      {
        changeType: "removed",
        resource: {
          kind: "Pod",
          namespace: "payments",
          name: "cache-warmup-2849"
        },
        detail: "Pod efemero finalizado e removido do inventario."
      }
    ]
  }
];

function buildResourceKey(kind: string, namespace: string, name: string) {
  return `${kind}:${namespace}:${name}`;
}

const namespaceMap = new Map(
  sampleNamespaces.map((namespace) => [namespace.name, namespace])
);

const resourceDetailMap = new Map(
  sampleResourceDetails.map((detail) => [
    buildResourceKey(detail.resource.kind, detail.resource.namespace, detail.resource.name),
    detail
  ])
);

const snapshotDiffMap = new Map(
  sampleSnapshotDiffs.map((diff) => [
    `${diff.currentSnapshotId}:${diff.previousSnapshotId}`,
    diff
  ])
);

export function getSampleNamespace(name: string) {
  return namespaceMap.get(name) ?? sampleNamespaces[0];
}

export function getSampleResourceDetail(
  kind: string,
  namespace: string,
  name: string
) {
  return (
    resourceDetailMap.get(buildResourceKey(kind, namespace, name)) ??
    ({
      resource: {
        kind: kind as ResourceKind,
        namespace,
        name,
        status: "Unknown",
        health: "unknown",
        summary: "Recurso ainda nao encontrado no fallback local.",
        issueCount: 0
      },
      metrics: {},
      issues: [],
      suggestedCommands: [
        `kubectl -n ${namespace} describe ${kind.toLowerCase()} ${name}`
      ],
      relations: [],
      history: [],
      insights: [],
      references: []
    } satisfies ResourceDetail)
  );
}

export function getSampleRelations(kind: string, namespace: string, name: string) {
  return getSampleResourceDetail(kind, namespace, name).relations;
}

export function getSampleSnapshotDiff(currentId: string, previousId: string) {
  return (
    snapshotDiffMap.get(`${currentId}:${previousId}`) ?? sampleSnapshotDiffs[0]
  );
}

export function groupIssuesByNamespace(issues: Issue[]) {
  return issues.reduce<Record<string, Issue[]>>((groups, issue) => {
    const namespace = issue.resourceRef?.namespace ?? "cluster";
    groups[namespace] ??= [];
    groups[namespace].push(issue);
    return groups;
  }, {});
}
