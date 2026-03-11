import type { AnalysisRunResponse } from "@k8s-ai-mvp/shared";

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
      highlightedIssues: [
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
              detail: "Comparar uso de memoria dos ultimos 24h com os limites atuais do deployment."
            },
            {
              title: "Ajustar recursos",
              detail: "Atualizar requests/limits do deployment e revisar HPA se existir."
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
              detail: "Listar pods com maior uso e confirmar se ha requests abaixo do padrao."
            }
          ],
          suggestedCommands: [
            "kubectl top pod -A --sort-by=memory | head -20",
            "kubectl describe node worker-03"
          ],
          detectedAt: "2026-03-11T16:00:00.000Z"
        }
      ]
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
        pressure: [],
        podCount: 26,
        topWorkloads: [
          {
            kind: "Deployment",
            name: "core-api",
            namespace: "core-api",
            cpuCores: 0.9,
            memoryBytes: 734003200
          },
          {
            kind: "StatefulSet",
            name: "redis-cache",
            namespace: "core-api",
            cpuCores: 0.6,
            memoryBytes: 524288000
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
        pressure: ["memory", "pid"],
        podCount: 34,
        topWorkloads: [
          {
            kind: "Deployment",
            name: "payments-worker",
            namespace: "payments",
            cpuCores: 1.8,
            memoryBytes: 1363148800
          },
          {
            kind: "Job",
            name: "billing-sync",
            namespace: "payments",
            cpuCores: 1.1,
            memoryBytes: 943718400
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
            detail: "Comparar uso de memoria dos ultimos 24h com os limites atuais do deployment."
          },
          {
            title: "Ajustar recursos",
            detail: "Atualizar requests/limits do deployment e revisar HPA se existir."
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
            detail: "Listar pods com maior uso e confirmar se ha requests abaixo do padrao."
          }
        ],
        suggestedCommands: [
          "kubectl top pod -A --sort-by=memory | head -20",
          "kubectl describe node worker-03"
        ],
        detectedAt: "2026-03-11T16:00:00.000Z"
      }
    ]
  }
};

export const sampleChatPrompts = [
  "Quais pods estao reiniciando mais agora?",
  "Quais namespaces concentram mais memoria?",
  "Tem deployment sem requests ou limits?",
  "Quais nodes estao mais carregados?"
];
