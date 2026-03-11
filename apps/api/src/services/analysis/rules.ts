import type {
  V1ConfigMap,
  V1CronJob,
  V1Deployment,
  V1EndpointSlice,
  V1Ingress,
  V1Job,
  V1PersistentVolumeClaim,
  V1Pod,
  V1PodDisruptionBudget,
  V1PodSpec,
  V1ReplicaSet,
  V1Secret,
  V1Service,
  V2HorizontalPodAutoscaler
} from "@kubernetes/client-node";
import type { Issue, NodeHealth, PodHealth, WorkloadSummary } from "@k8s-ai-mvp/shared";
import type { K8sGptFinding } from "../../connectors/k8sgpt.js";
import { deploymentResourceSummary, getPodOwner, toResourceRef } from "../../lib/helpers.js";

export interface RuleContext {
  collectedAt: string;
  pods: PodHealth[];
  nodes: NodeHealth[];
  namespaces: Array<{ name: string; podCount: number; unhealthyPodCount: number; restartCount: number }>;
  deployments: V1Deployment[];
  rawPods: V1Pod[];
  workloadUsage: Map<string, WorkloadSummary>;
  k8sGptFindings: K8sGptFinding[];
  services?: V1Service[];
  ingresses?: V1Ingress[];
  endpointSlices?: V1EndpointSlice[];
  horizontalPodAutoscalers?: V2HorizontalPodAutoscaler[];
  replicaSets?: V1ReplicaSet[];
  podDisruptionBudgets?: V1PodDisruptionBudget[];
  jobs?: V1Job[];
  cronJobs?: V1CronJob[];
  persistentVolumeClaims?: V1PersistentVolumeClaim[];
  configMaps?: V1ConfigMap[];
  secrets?: V1Secret[];
}

export function buildRuleIssues(context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  issues.push(...buildPodIssues(context));
  issues.push(...buildNodeIssues(context));
  issues.push(...buildDeploymentIssues(context));
  issues.push(...buildServiceIssues(context));
  issues.push(...buildIngressIssues(context));
  issues.push(...buildHpaIssues(context));
  issues.push(...buildJobIssues(context));
  issues.push(...buildCleanupIssues(context));
  issues.push(...buildK8sGptIssues(context));

  return dedupeIssues(issues);
}

export function workloadKeyForPod(pod: V1Pod): string | undefined {
  const owner = getPodOwner(pod);
  const namespace = pod.metadata?.namespace ?? "default";
  if (!owner) {
    return undefined;
  }

  return `${owner.kind}:${namespace}/${owner.name}`;
}

function buildPodIssues(context: RuleContext): Issue[] {
  return context.pods.flatMap((pod) => {
    if (pod.restarts < 5) {
      return [];
    }

    return [
      createIssue({
        id: `pod-${pod.namespace}-${pod.name}`,
        title: `Pod ${pod.namespace}/${pod.name} com reinicios elevados`,
        severity: pod.restarts >= 8 ? "high" : "medium",
        category: "availability",
        detectedAt: context.collectedAt,
        resourceRef: toResourceRef("Pod", pod.name, pod.namespace, pod.nodeName),
        summary: `O pod acumulou ${pod.restarts} reinicios e requer investigacao.`,
        evidence: [
          { label: "phase", value: pod.phase },
          { label: "restarts", value: String(pod.restarts) },
          { label: "ready", value: String(pod.ready) },
          { label: "reason", value: pod.reason ?? "unknown" }
        ],
        recommendation: "Investigue logs, eventos recentes e dependencia externa antes de reiniciar ou recriar o workload.",
        playbook: [
          { title: "Verificar eventos", detail: `Revise eventos recentes do pod ${pod.namespace}/${pod.name}.` },
          { title: "Inspecionar logs", detail: "Compare logs atuais e anteriores para identificar loops de falha." }
        ],
        suggestedCommands: [
          `kubectl describe pod ${pod.name} -n ${pod.namespace}`,
          `kubectl logs ${pod.name} -n ${pod.namespace} --previous`
        ]
      })
    ];
  });
}

function buildNodeIssues(context: RuleContext): Issue[] {
  return context.nodes.flatMap((node) => {
    if (node.pressure.length === 0 && (node.usage.cpuPercent ?? 0) < 90 && (node.usage.memoryPercent ?? 0) < 90) {
      return [];
    }

    return [
      createIssue({
        id: `node-${node.name}`,
        title: `Node ${node.name} com sinais de pressao`,
        severity: node.pressure.length > 0 ? "high" : "medium",
        category: "capacity",
        detectedAt: context.collectedAt,
        resourceRef: toResourceRef("Node", node.name, undefined, node.name),
        summary: "O node apresenta uso alto ou condicoes de pressao que podem afetar agendamento e estabilidade.",
        evidence: [
          { label: "pressure", value: node.pressure.join(", ") || "none" },
          { label: "cpu", value: percentValue(node.usage.cpuPercent) },
          { label: "memory", value: percentValue(node.usage.memoryPercent) }
        ],
        recommendation: "Redistribua carga, revise requests/limits e confirme se ha capacidade sobrando no cluster.",
        playbook: [
          { title: "Validar capacidade", detail: `Confira os workloads mais pesados rodando em ${node.name}.` },
          { title: "Checar pressoes", detail: "Procure eviction, disk pressure ou memory pressure recentes." }
        ],
        suggestedCommands: [
          `kubectl describe node ${node.name}`,
          `kubectl top node ${node.name}`
        ]
      })
    ];
  });
}

function buildDeploymentIssues(context: RuleContext): Issue[] {
  const issues: Issue[] = [];
  const services = context.services ?? [];
  const endpointSlices = context.endpointSlices ?? [];
  const podDisruptionBudgets = context.podDisruptionBudgets ?? [];
  const configMaps = context.configMaps ?? [];
  const secrets = context.secrets ?? [];

  for (const deployment of context.deployments) {
    const namespace = deployment.metadata?.namespace ?? "default";
    const name = deployment.metadata?.name ?? "unknown";
    const summary = deploymentResourceSummary(deployment);
    const usage = context.workloadUsage.get(`${namespace}/${name}`);
    const spec = deployment.spec?.template.spec;

    if (summary.missingResources) {
      issues.push(
        createIssue({
          id: `deployment-missing-resources-${namespace}-${name}`,
          title: `Deployment ${namespace}/${name} sem requests/limits completos`,
          severity: "high",
          category: "configuration",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Deployment", name, namespace),
          summary: "Containers do deployment nao possuem requests e limits completos.",
          evidence: [{ label: "containers", value: String(spec?.containers?.length ?? 0) }],
          recommendation: "Defina requests e limits para CPU e memoria em todos os containers.",
          playbook: [
            { title: "Mapear containers", detail: "Liste quais containers estao sem requests/limits." },
            { title: "Ajustar capacidade", detail: "Use consumo observado para definir requests realistas." }
          ],
          suggestedCommands: [
            `kubectl get deployment ${name} -n ${namespace} -o yaml`,
            `kubectl top pod -n ${namespace} -l app=${name}`
          ]
        })
      );
    }

    if ((summary.cpuRequest ?? 0) > 0 && (usage?.cpuCores ?? 0) > (summary.cpuRequest ?? 0) * 2) {
      issues.push(
        createIssue({
          id: `deployment-cpu-mismatch-${namespace}-${name}`,
          title: `Deployment ${namespace}/${name} consumindo bem acima do request`,
          severity: "medium",
          category: "capacity",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Deployment", name, namespace),
          summary: "O uso observado de CPU esta significativamente acima do request configurado.",
          evidence: [
            { label: "cpu_request", value: `${summary.cpuRequest?.toFixed(2)} cores` },
            { label: "cpu_observed", value: `${usage?.cpuCores?.toFixed(2)} cores` }
          ],
          recommendation: "Revise requests/HPA para evitar throttling e agendamento otimista demais.",
          playbook: [
            { title: "Comparar com historico", detail: "Valide se o pico observado e recorrente ou apenas pontual." }
          ],
          suggestedCommands: [
            `kubectl top pod -n ${namespace} -l app=${name}`,
            `kubectl describe deployment ${name} -n ${namespace}`
          ]
        })
      );
    }

    if (!hasAnyProbe(spec)) {
      issues.push(
        createIssue({
          id: `deployment-missing-probes-${namespace}-${name}`,
          title: `Deployment ${namespace}/${name} sem probes`,
          severity: "medium",
          category: "reliability",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Deployment", name, namespace),
          summary: "Nenhum container do deployment possui readiness, liveness ou startup probe.",
          evidence: [{ label: "containers", value: String(spec?.containers?.length ?? 0) }],
          recommendation: "Configure ao menos readiness e liveness probe para reduzir falhas silenciosas no rollout.",
          playbook: [
            { title: "Definir health checks", detail: "Escolha endpoints ou comandos que representem saude real da aplicacao." }
          ],
          suggestedCommands: [`kubectl get deployment ${name} -n ${namespace} -o yaml`]
        })
      );
    }

    if (hasDeploymentRolloutIssue(deployment)) {
      issues.push(
        createIssue({
          id: `deployment-rollout-${namespace}-${name}`,
          title: `Rollout do deployment ${namespace}/${name} apresenta degradacao`,
          severity: "high",
          category: "rollout",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Deployment", name, namespace),
          summary: "O rollout indica replicas indisponiveis, progresso travado ou condicao negativa relevante.",
          evidence: [
            { label: "desired", value: String(deployment.spec?.replicas ?? 1) },
            { label: "ready", value: String(deployment.status?.readyReplicas ?? 0) },
            { label: "reason", value: findConditionReason(deployment) ?? "unknown" }
          ],
          recommendation: "Revise eventos, imagem, probes e dependencia externa antes de forcar novo rollout.",
          playbook: [
            { title: "Checar rollout", detail: "Confirme se ha ProgressDeadlineExceeded ou pods indisponiveis." },
            { title: "Inspecionar pods", detail: "Veja se os pods novos estao travando na inicializacao." }
          ],
          suggestedCommands: [
            `kubectl rollout status deployment/${name} -n ${namespace}`,
            `kubectl describe deployment ${name} -n ${namespace}`
          ]
        })
      );
    }

    const deploymentServices = findServicesForDeployment(services, deployment);
    if (countContainerPorts(spec) > 0 && deploymentServices.length === 0) {
      issues.push(
        createIssue({
          id: `deployment-missing-service-${namespace}-${name}`,
          title: `Deployment ${namespace}/${name} sem Service associado`,
          severity: "low",
          category: "networking",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Deployment", name, namespace),
          summary: "O deployment expoe portas em containers, mas nenhum Service seleciona seus pods.",
          evidence: [{ label: "container_ports", value: String(countContainerPorts(spec)) }],
          recommendation: "Confirme se o acesso deve ser interno/externo e crie um Service quando apropriado.",
          playbook: [
            { title: "Validar exposicao", detail: "Verifique se o workload deveria receber trafego via rede do cluster." }
          ],
          suggestedCommands: [
            `kubectl get svc -n ${namespace}`,
            `kubectl get deployment ${name} -n ${namespace} -o yaml`
          ]
        })
      );
    }

    if ((deployment.spec?.replicas ?? 1) <= 1 && findMatchingPdbs(podDisruptionBudgets, deployment).length === 0) {
      issues.push(
        createIssue({
          id: `deployment-missing-pdb-${namespace}-${name}`,
          title: `Deployment ${namespace}/${name} com replica unica e sem PDB`,
          severity: "medium",
          category: "reliability",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Deployment", name, namespace),
          summary: "Replica unica aumenta risco de indisponibilidade durante manutencoes ou eviccoes.",
          evidence: [{ label: "replicas", value: String(deployment.spec?.replicas ?? 1) }],
          recommendation: "Considere mais replicas e um PodDisruptionBudget quando o servico precisar continuar disponivel.",
          playbook: [
            { title: "Avaliar criticidade", detail: "Confirme se downtime temporario e aceitavel para este deployment." }
          ],
          suggestedCommands: [
            `kubectl get pdb -n ${namespace}`,
            `kubectl describe deployment ${name} -n ${namespace}`
          ]
        })
      );
    }

    issues.push(...buildMissingReferenceIssues(context, deployment, configMaps, secrets));

    for (const service of deploymentServices) {
      const readyEndpoints = countReadyEndpoints(namespace, service.metadata?.name ?? "unknown", endpointSlices);
      if (readyEndpoints === 0) {
        issues.push(
          createIssue({
            id: `deployment-no-endpoints-${namespace}-${name}-${service.metadata?.name ?? "unknown"}`,
            title: `Service ${namespace}/${service.metadata?.name ?? "unknown"} sem endpoints prontos para ${name}`,
            severity: "high",
            category: "availability",
            detectedAt: context.collectedAt,
            resourceRef: toResourceRef("Deployment", name, namespace),
            summary: "O deployment possui Service associado, mas nenhum EndpointSlice pronto foi encontrado.",
            evidence: [{ label: "service", value: service.metadata?.name ?? "unknown" }],
            recommendation: "Valide labels, readiness probe e portas expostas para recuperar backends validos.",
            playbook: [
              { title: "Conferir selector", detail: "Garanta que o selector do Service corresponde aos labels dos pods." }
            ],
            suggestedCommands: [
              `kubectl describe svc ${service.metadata?.name ?? "unknown"} -n ${namespace}`,
              `kubectl get endpointslice -n ${namespace} -l kubernetes.io/service-name=${service.metadata?.name ?? "unknown"} -o yaml`
            ]
          })
        );
      }
    }
  }

  return issues;
}

function buildServiceIssues(context: RuleContext): Issue[] {
  const endpointSlices = context.endpointSlices ?? [];

  return (context.services ?? []).flatMap((service) => {
    const namespace = service.metadata?.namespace ?? "default";
    const name = service.metadata?.name ?? "unknown";
    const selector = service.spec?.selector;
    const readyEndpoints = countReadyEndpoints(namespace, name, endpointSlices);

    if (selector && Object.keys(selector).length > 0 && readyEndpoints === 0) {
      return [
        createIssue({
          id: `service-no-endpoints-${namespace}-${name}`,
          title: `Service ${namespace}/${name} com selector e sem endpoints`,
          severity: "high",
          category: "networking",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Service", name, namespace),
          summary: "O Service possui selector, mas nenhum backend pronto foi encontrado nos EndpointSlices.",
          evidence: [{ label: "selector", value: renderSelector(selector) }],
          recommendation: "Revise labels, readiness e targetPort para garantir roteamento valido.",
          playbook: [
            { title: "Checar Service e pods", detail: "Compare selector, labels e portas dos pods." }
          ],
          suggestedCommands: [
            `kubectl describe svc ${name} -n ${namespace}`,
            `kubectl get endpointslice -n ${namespace} -l kubernetes.io/service-name=${name}`
          ]
        })
      ];
    }

    if ((!selector || Object.keys(selector).length === 0) && readyEndpoints === 0) {
      return [
        createIssue({
          id: `service-orphan-${namespace}-${name}`,
          title: `Service ${namespace}/${name} parece sem backend gerenciado`,
          severity: "low",
          category: "cleanup",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Service", name, namespace),
          summary: "O Service nao possui selector e tambem nao ha EndpointSlices associados.",
          evidence: [{ label: "type", value: service.spec?.type ?? "ClusterIP" }],
          recommendation: "Confirme se ele e abastecido manualmente; caso contrario, avalie remover ou corrigir a configuracao.",
          playbook: [
            { title: "Validar uso", detail: "Cheque se o Service foi deixado para integracao externa ou se esta abandonado." }
          ],
          suggestedCommands: [
            `kubectl get svc ${name} -n ${namespace} -o yaml`,
            `kubectl get endpointslice -n ${namespace} -l kubernetes.io/service-name=${name}`
          ]
        })
      ];
    }

    return [];
  });
}

function buildIngressIssues(context: RuleContext): Issue[] {
  const services = context.services ?? [];
  const endpointSlices = context.endpointSlices ?? [];
  const issues: Issue[] = [];

  for (const ingress of context.ingresses ?? []) {
    const namespace = ingress.metadata?.namespace ?? "default";
    const name = ingress.metadata?.name ?? "unknown";
    const ingressClass = ingress.spec?.ingressClassName ?? ingress.metadata?.annotations?.["kubernetes.io/ingress.class"];

    if (!ingressClass) {
      issues.push(
        createIssue({
          id: `ingress-missing-class-${namespace}-${name}`,
          title: `Ingress ${namespace}/${name} sem classe efetiva`,
          severity: "low",
          category: "networking",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Ingress", name, namespace),
          summary: "O ingress nao declara ingressClassName nem anotacao de classe.",
          evidence: [{ label: "rules", value: String(ingress.spec?.rules?.length ?? 0) }],
          recommendation: "Defina a classe para evitar comportamento ambiguo em clusters com multiplos controllers.",
          playbook: [{ title: "Confirmar controller", detail: "Veja qual ingress controller deveria reconciliar este recurso." }],
          suggestedCommands: [`kubectl get ingress ${name} -n ${namespace} -o yaml`]
        })
      );
    }

    for (const backendServiceName of ingressBackendServices(ingress)) {
      const service = services.find(
        (item) => (item.metadata?.namespace ?? "default") === namespace && (item.metadata?.name ?? "unknown") === backendServiceName
      );
      const readyEndpoints = service ? countReadyEndpoints(namespace, backendServiceName, endpointSlices) : 0;
      if (!service || readyEndpoints === 0) {
        issues.push(
          createIssue({
            id: `ingress-backend-${namespace}-${name}-${backendServiceName}`,
            title: `Ingress ${namespace}/${name} aponta para backend sem endpoint pronto`,
            severity: "high",
            category: "networking",
            detectedAt: context.collectedAt,
            resourceRef: toResourceRef("Ingress", name, namespace),
            summary: `O backend ${backendServiceName} nao possui Service valido com endpoints prontos.`,
            evidence: [
              { label: "backend_service", value: backendServiceName },
              { label: "ready_endpoints", value: String(readyEndpoints) }
            ],
            recommendation: "Corrija backend, Service ou readiness dos pods antes de expor o trafego.",
            playbook: [{ title: "Validar cadeia", detail: "Inspecione ingress, service e endpointslice na mesma trilha." }],
            suggestedCommands: [
              `kubectl describe ingress ${name} -n ${namespace}`,
              `kubectl describe svc ${backendServiceName} -n ${namespace}`
            ]
          })
        );
      }
    }
  }

  return issues;
}

function buildHpaIssues(context: RuleContext): Issue[] {
  return (context.horizontalPodAutoscalers ?? []).flatMap((hpa) => {
    const namespace = hpa.metadata?.namespace ?? "default";
    const name = hpa.metadata?.name ?? "unknown";
    const targetKind = hpa.spec?.scaleTargetRef.kind;
    const targetName = hpa.spec?.scaleTargetRef.name;
    const targetExists = targetKind === "Deployment"
      ? context.deployments.some(
          (deployment) =>
            (deployment.metadata?.namespace ?? "default") === namespace &&
            (deployment.metadata?.name ?? "unknown") === targetName
        )
      : true;

    if (!targetExists) {
      return [
        createIssue({
          id: `hpa-missing-target-${namespace}-${name}`,
          title: `HPA ${namespace}/${name} referencia alvo inexistente`,
          severity: "high",
          category: "autoscaling",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("HorizontalPodAutoscaler", name, namespace),
          summary: "O alvo configurado pelo HPA nao foi encontrado entre os workloads conhecidos.",
          evidence: [
            { label: "target_kind", value: targetKind ?? "unknown" },
            { label: "target_name", value: targetName ?? "unknown" }
          ],
          recommendation: "Corrija o scaleTargetRef ou remova o HPA se ele nao for mais necessario.",
          playbook: [{ title: "Comparar target", detail: "Valide nome, namespace e kind do workload alvo." }],
          suggestedCommands: [`kubectl describe hpa ${name} -n ${namespace}`]
        })
      ];
    }

    if (isHpaAtMax(hpa)) {
      return [
        createIssue({
          id: `hpa-at-max-${namespace}-${name}`,
          title: `HPA ${namespace}/${name} operando no maximo configurado`,
          severity: "medium",
          category: "autoscaling",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("HorizontalPodAutoscaler", name, namespace),
          summary: "O autoscaler ja esta em maxReplicas e pode nao conseguir absorver mais carga.",
          evidence: [
            { label: "current_replicas", value: String(hpa.status?.currentReplicas ?? 0) },
            { label: "max_replicas", value: String(hpa.spec?.maxReplicas ?? 0) }
          ],
          recommendation: "Revise maxReplicas, target utilization e capacidade de nodes antes de novos picos.",
          playbook: [{ title: "Confirmar saturacao", detail: "Compare uso observado com os targets do HPA." }],
          suggestedCommands: [
            `kubectl describe hpa ${name} -n ${namespace}`,
            `kubectl top pod -n ${namespace}`
          ]
        })
      ];
    }

    return [];
  });
}

function buildJobIssues(context: RuleContext): Issue[] {
  const issues: Issue[] = [];

  for (const job of context.jobs ?? []) {
    const namespace = job.metadata?.namespace ?? "default";
    const name = job.metadata?.name ?? "unknown";
    const failed = job.status?.failed ?? 0;
    const succeeded = job.status?.succeeded ?? 0;
    const completionTime = job.status?.completionTime ?? job.status?.startTime;
    const ageHours = hoursSince(completionTime);

    if (failed > 0) {
      issues.push(
        createIssue({
          id: `job-failed-${namespace}-${name}`,
          title: `Job ${namespace}/${name} acumulou falhas`,
          severity: failed >= 3 ? "high" : "medium",
          category: "availability",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Job", name, namespace),
          summary: "O job registrou falhas e pode estar deixando backlog ou retrabalho no ambiente.",
          evidence: [
            { label: "failed", value: String(failed) },
            { label: "succeeded", value: String(succeeded) }
          ],
          recommendation: "Revise logs, retries, dependencia externa e politica de limpeza do job antes de reexecutar.",
          playbook: [
            { title: "Inspecionar execucao", detail: "Compare pods falhos, logs e eventos do job." }
          ],
          suggestedCommands: [
            `kubectl describe job ${name} -n ${namespace}`,
            `kubectl logs job/${name} -n ${namespace}`
          ]
        })
      );
    }

    if (ageHours !== undefined && ageHours >= 168 && (failed > 0 || succeeded > 0)) {
      issues.push(
        createIssue({
          id: `job-stale-${namespace}-${name}`,
          title: `Job ${namespace}/${name} parece historico acumulado`,
          severity: "low",
          category: "cleanup",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("Job", name, namespace),
          summary: "O job terminou ha varios dias e ainda segue no namespace, o que pode aumentar ruido operacional.",
          evidence: [
            { label: "age_hours", value: String(Math.round(ageHours)) },
            { label: "status", value: failed > 0 ? "failed" : "completed" }
          ],
          recommendation: "Confirme retention esperada do job ou ajuste a politica de limpeza se o historico estiver excessivo.",
          playbook: [
            { title: "Validar retention", detail: "Cheque TTL, owner references e politica do CronJob pai, se existir." }
          ],
          suggestedCommands: [
            `kubectl get job ${name} -n ${namespace} -o yaml`
          ]
        })
      );
    }
  }

  return issues;
}

function buildCleanupIssues(context: RuleContext): Issue[] {
  const issues: Issue[] = [];
  const allWorkloadKeys = new Set(context.rawPods.map((pod) => workloadKeyForPod(pod)).filter(Boolean));

  for (const configMap of context.configMaps ?? []) {
    const namespace = configMap.metadata?.namespace ?? "default";
    const name = configMap.metadata?.name ?? "unknown";
    if (!isReferenceUsed(name, namespace, "ConfigMap", context.deployments, context.rawPods)) {
      issues.push(
        createIssue({
          id: `configmap-unused-${namespace}-${name}`,
          title: `ConfigMap ${namespace}/${name} parece sem uso`,
          severity: "low",
          category: "cleanup",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("ConfigMap", name, namespace),
          summary: "Nenhuma referencia estrutural foi encontrada em deployments ou pods coletados.",
          evidence: [{ label: "namespace", value: namespace }],
          recommendation: "Confirme se o ConfigMap ainda participa de workloads fora da coleta antes de remover.",
          playbook: [{ title: "Validar consumidores", detail: "Procure referencias em manifests, Helm charts e workloads ativos." }],
          suggestedCommands: [`kubectl get configmap ${name} -n ${namespace} -o yaml`]
        })
      );
    }
  }

  for (const pvc of context.persistentVolumeClaims ?? []) {
    const namespace = pvc.metadata?.namespace ?? "default";
    const name = pvc.metadata?.name ?? "unknown";
    if (!isReferenceUsed(name, namespace, "PersistentVolumeClaim", context.deployments, context.rawPods)) {
      issues.push(
        createIssue({
          id: `pvc-unused-${namespace}-${name}`,
          title: `PVC ${namespace}/${name} parece sem consumidor`,
          severity: "low",
          category: "cleanup",
          detectedAt: context.collectedAt,
          resourceRef: toResourceRef("PersistentVolumeClaim", name, namespace),
          summary: "Nenhum volume persistente com esse claim foi encontrado nos workloads coletados.",
          evidence: [{ label: "status", value: pvc.status?.phase ?? "unknown" }],
          recommendation: "Confirme se o PVC ainda e necessario ou se ficou orfao apos rollout/remocao de workload.",
          playbook: [{ title: "Verificar montagem", detail: "Procure o claim em volumes declarados por pods e deployments." }],
          suggestedCommands: [`kubectl get pvc ${name} -n ${namespace}`]
        })
      );
    }
  }

  for (const replicaSet of context.replicaSets ?? []) {
    const namespace = replicaSet.metadata?.namespace ?? "default";
    const name = replicaSet.metadata?.name ?? "unknown";
    const ownedByDeployment = replicaSet.metadata?.ownerReferences?.some((reference) => reference.kind === "Deployment");
    if (ownedByDeployment && (replicaSet.spec?.replicas ?? 0) === 0) {
      const key = `Deployment:${namespace}/${replicaSet.metadata?.ownerReferences?.find((reference) => reference.kind === "Deployment")?.name ?? ""}`;
      if (allWorkloadKeys.has(key)) {
        issues.push(
          createIssue({
            id: `replicaset-stale-${namespace}-${name}`,
            title: `ReplicaSet ${namespace}/${name} parece antigo e acumulado`,
            severity: "info",
            category: "cleanup",
            detectedAt: context.collectedAt,
            resourceRef: toResourceRef("ReplicaSet", name, namespace),
            summary: "ReplicaSet com zero replicas mantido fora do rollout atual.",
            evidence: [{ label: "owner", value: replicaSet.metadata?.ownerReferences?.[0]?.name ?? "unknown" }],
            recommendation: "Avalie politica de revisionHistoryLimit do deployment se houver muito historico acumulado.",
            playbook: [{ title: "Conferir historico", detail: "Veja quantos ReplicaSets antigos permanecem no namespace." }],
            suggestedCommands: [`kubectl get rs -n ${namespace}`]
          })
        );
      }
    }
  }

  return issues;
}

function buildK8sGptIssues(context: RuleContext): Issue[] {
  return context.k8sGptFindings.map((finding, index) =>
    createIssue({
      id: `k8sgpt-${finding.namespace ?? "cluster"}-${finding.kind ?? "resource"}-${finding.name}-${index}`,
      title: `K8sGPT: ${finding.kind ?? "Resource"} ${finding.namespace ? `${finding.namespace}/` : ""}${finding.name}`,
      severity: "medium",
      category: inferCategoryFromText(finding.details),
      source: "k8sgpt",
      detectedAt: context.collectedAt,
      resourceRef: finding.kind ? toResourceRef(finding.kind, finding.name, finding.namespace) : undefined,
      summary: finding.details ?? "K8sGPT encontrou um problema potencial.",
      evidence: [{ label: "source", value: "k8sgpt" }],
      recommendation: "Valide o recurso no cluster e use os comandos sugeridos para confirmar o diagnostico.",
      playbook: [{ title: "Confirmar recurso", detail: "Compare a recomendacao do K8sGPT com status e eventos reais do objeto." }],
      suggestedCommands: finding.kind
        ? [`kubectl describe ${finding.kind.toLowerCase()} ${finding.name}${finding.namespace ? ` -n ${finding.namespace}` : ""}`]
        : []
    })
  );
}

function buildMissingReferenceIssues(
  context: RuleContext,
  deployment: V1Deployment,
  configMaps: V1ConfigMap[],
  secrets: V1Secret[]
): Issue[] {
  const issues: Issue[] = [];
  const namespace = deployment.metadata?.namespace ?? "default";
  const name = deployment.metadata?.name ?? "unknown";
  const references = collectReferencesFromPodSpec(deployment.spec?.template.spec);

  for (const configMapName of references.configMaps) {
    const exists = configMaps.some(
      (configMap) => (configMap.metadata?.namespace ?? "default") === namespace && (configMap.metadata?.name ?? "unknown") === configMapName
    );
    if (!exists) {
      issues.push(
        createMissingReferenceIssue(context.collectedAt, "ConfigMap", configMapName, namespace, "Deployment", name)
      );
    }
  }

  for (const secretName of references.secrets) {
    const exists = secrets.some(
      (secret) => (secret.metadata?.namespace ?? "default") === namespace && (secret.metadata?.name ?? "unknown") === secretName
    );
    if (!exists) {
      issues.push(
        createMissingReferenceIssue(context.collectedAt, "Secret", secretName, namespace, "Deployment", name)
      );
    }
  }

  return issues;
}

function createMissingReferenceIssue(
  detectedAt: string,
  kind: "ConfigMap" | "Secret",
  name: string,
  namespace: string,
  parentKind: string,
  parentName: string
): Issue {
  return createIssue({
    id: `${kind.toLowerCase()}-missing-${namespace}-${parentName}-${name}`,
    title: `${parentKind} ${namespace}/${parentName} referencia ${kind} inexistente`,
    severity: "high",
    category: "configuration",
    detectedAt,
    resourceRef: toResourceRef(parentKind, parentName, namespace),
    summary: `${kind} ${namespace}/${name} nao foi encontrado, mas continua referenciado no workload.`,
    evidence: [{ label: "missing_reference", value: `${kind}:${name}` }],
    recommendation: "Corrija o nome da referencia ou recrie o recurso antes do proximo rollout.",
    playbook: [{ title: "Validar manifest", detail: "Confirme volumes, envFrom e env valueFrom do template do pod." }],
    suggestedCommands: [`kubectl get ${kind.toLowerCase()} ${name} -n ${namespace}`]
  });
}

function createIssue(input: {
  id: string;
  title: string;
  severity: Issue["severity"];
  category: Issue["category"];
  detectedAt: string;
  summary: string;
  evidence: Issue["evidence"];
  recommendation: string;
  playbook: Issue["playbook"];
  suggestedCommands: string[];
  source?: Issue["source"];
  resourceRef?: Issue["resourceRef"];
}): Issue {
  return {
    source: input.source ?? "rule",
    resourceRef: input.resourceRef,
    ...input
  };
}

function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) {
      return false;
    }

    seen.add(issue.id);
    return true;
  });
}

function findServicesForDeployment(services: V1Service[], deployment: V1Deployment) {
  const namespace = deployment.metadata?.namespace ?? "default";
  const labels = deployment.spec?.template.metadata?.labels;
  return services.filter(
    (service) => (service.metadata?.namespace ?? "default") === namespace && selectorMatches(service.spec?.selector, labels)
  );
}

function findMatchingPdbs(podDisruptionBudgets: V1PodDisruptionBudget[], deployment: V1Deployment) {
  const namespace = deployment.metadata?.namespace ?? "default";
  const labels = deployment.spec?.template.metadata?.labels;
  return podDisruptionBudgets.filter(
    (pdb) => (pdb.metadata?.namespace ?? "default") === namespace && selectorMatches(pdb.spec?.selector?.matchLabels, labels)
  );
}

function selectorMatches(selector: Record<string, string> | undefined, labels: Record<string, string> | undefined) {
  if (!selector || Object.keys(selector).length === 0 || !labels) {
    return false;
  }

  return Object.entries(selector).every(([key, value]) => labels[key] === value);
}

function countReadyEndpoints(namespace: string, serviceName: string, endpointSlices: V1EndpointSlice[]) {
  return endpointSlices
    .filter(
      (slice) =>
        (slice.metadata?.namespace ?? "default") === namespace &&
        slice.metadata?.labels?.["kubernetes.io/service-name"] === serviceName
    )
    .reduce(
      (total, slice) =>
        total + (slice.endpoints ?? []).filter((endpoint) => endpoint.conditions?.ready !== false).length,
      0
    );
}

function renderSelector(selector: Record<string, string> | undefined) {
  if (!selector || Object.keys(selector).length === 0) {
    return "none";
  }

  return Object.entries(selector)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function hasAnyProbe(spec: V1PodSpec | undefined) {
  return (spec?.containers ?? []).some(
    (container) => Boolean(container.readinessProbe || container.livenessProbe || container.startupProbe)
  );
}

function hasDeploymentRolloutIssue(deployment: V1Deployment) {
  const desired = deployment.spec?.replicas ?? 1;
  const ready = deployment.status?.readyReplicas ?? 0;
  const unavailable = deployment.status?.unavailableReplicas ?? 0;
  const progressing = deployment.status?.conditions?.find((condition) => condition.type === "Progressing");

  return (
    ready < desired ||
    unavailable > 0 ||
    progressing?.reason === "ProgressDeadlineExceeded" ||
    deployment.status?.conditions?.some((condition) => condition.status === "False" && condition.type === "Available") === true
  );
}

function findConditionReason(deployment: V1Deployment) {
  return deployment.status?.conditions?.find((condition) => condition.reason)?.reason;
}

function countContainerPorts(spec: V1PodSpec | undefined) {
  return (spec?.containers ?? []).reduce((total, container) => total + (container.ports?.length ?? 0), 0);
}

function isHpaAtMax(hpa: V2HorizontalPodAutoscaler) {
  const currentReplicas = hpa.status?.currentReplicas ?? 0;
  const maxReplicas = hpa.spec?.maxReplicas ?? 0;
  return maxReplicas > 0 && currentReplicas >= maxReplicas;
}

function ingressBackendServices(ingress: V1Ingress) {
  return Array.from(
    new Set(
      (ingress.spec?.rules ?? []).flatMap((rule) =>
        (rule.http?.paths ?? []).flatMap((path) => (path.backend?.service?.name ? [path.backend.service.name] : []))
      )
    )
  );
}

function collectReferencesFromPodSpec(spec: V1PodSpec | undefined) {
  const configMaps = new Set<string>();
  const secrets = new Set<string>();

  for (const container of spec?.containers ?? []) {
    for (const envFrom of container.envFrom ?? []) {
      if (envFrom.configMapRef?.name) {
        configMaps.add(envFrom.configMapRef.name);
      }
      if (envFrom.secretRef?.name) {
        secrets.add(envFrom.secretRef.name);
      }
    }

    for (const env of container.env ?? []) {
      if (env.valueFrom?.configMapKeyRef?.name) {
        configMaps.add(env.valueFrom.configMapKeyRef.name);
      }
      if (env.valueFrom?.secretKeyRef?.name) {
        secrets.add(env.valueFrom.secretKeyRef.name);
      }
    }
  }

  for (const volume of spec?.volumes ?? []) {
    if (volume.configMap?.name) {
      configMaps.add(volume.configMap.name);
    }
    if (volume.secret?.secretName) {
      secrets.add(volume.secret.secretName);
    }
  }

  for (const imagePullSecret of spec?.imagePullSecrets ?? []) {
    if (imagePullSecret.name) {
      secrets.add(imagePullSecret.name);
    }
  }

  return {
    configMaps: [...configMaps],
    secrets: [...secrets]
  };
}

function isReferenceUsed(
  name: string,
  namespace: string,
  kind: "ConfigMap" | "PersistentVolumeClaim",
  deployments: V1Deployment[],
  pods: V1Pod[]
) {
  for (const deployment of deployments) {
    if ((deployment.metadata?.namespace ?? "default") !== namespace) {
      continue;
    }

    const spec = deployment.spec?.template.spec;
    if (kind === "ConfigMap" && collectReferencesFromPodSpec(spec).configMaps.includes(name)) {
      return true;
    }
    if (kind === "PersistentVolumeClaim" && (spec?.volumes ?? []).some((volume) => volume.persistentVolumeClaim?.claimName === name)) {
      return true;
    }
  }

  for (const pod of pods) {
    if ((pod.metadata?.namespace ?? "default") !== namespace) {
      continue;
    }

    const spec = pod.spec;
    if (kind === "ConfigMap" && collectReferencesFromPodSpec(spec).configMaps.includes(name)) {
      return true;
    }
    if (kind === "PersistentVolumeClaim" && (spec?.volumes ?? []).some((volume) => volume.persistentVolumeClaim?.claimName === name)) {
      return true;
    }
  }

  return false;
}

function inferCategoryFromText(text?: string): Issue["category"] {
  const lower = text?.toLowerCase() ?? "";
  if (lower.includes("endpoint") || lower.includes("ingress") || lower.includes("service")) {
    return "networking";
  }
  if (lower.includes("hpa") || lower.includes("replica")) {
    return "autoscaling";
  }
  if (lower.includes("rollout") || lower.includes("progressdeadline")) {
    return "rollout";
  }
  if (lower.includes("unused") || lower.includes("orphan")) {
    return "cleanup";
  }
  return "reliability";
}

function percentValue(value?: number) {
  return value === undefined ? "n/a" : `${Math.round(value)}%`;
}

function hoursSince(timestamp?: Date | string) {
  if (!timestamp) {
    return undefined;
  }

  const value = new Date(timestamp).getTime();
  if (Number.isNaN(value)) {
    return undefined;
  }

  return (Date.now() - value) / 3_600_000;
}
