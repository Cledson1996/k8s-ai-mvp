import {
  AppsV1Api,
  AutoscalingV2Api,
  BatchV1Api,
  CoreV1Api,
  DiscoveryV1Api,
  KubeConfig,
  NetworkingV1Api,
  PolicyV1Api,
  type V1ConfigMap,
  type V1CronJob,
  type V1DaemonSet,
  type V1EndpointSlice,
  type V1HorizontalPodAutoscaler,
  type V1Ingress,
  type V1IngressClass,
  type V1Job,
  type V1Namespace,
  type V1Node,
  type V1PersistentVolumeClaim,
  type V1Pod,
  type V1PodDisruptionBudget,
  type V1ReplicaSet,
  type V1Secret,
  type V1Service,
  type V1ServiceAccount,
  type V1StatefulSet,
  type V2HorizontalPodAutoscaler
} from "@kubernetes/client-node";
import type { AppConfig } from "../config.js";

export interface ClusterInventory {
  clusterName: string;
  collectedAt: string;
  nodes: V1Node[];
  namespaces: V1Namespace[];
  pods: V1Pod[];
  deployments: import("@kubernetes/client-node").V1Deployment[];
  replicaSets: V1ReplicaSet[];
  statefulSets: V1StatefulSet[];
  daemonSets: V1DaemonSet[];
  horizontalPodAutoscalers: V2HorizontalPodAutoscaler[];
  services: V1Service[];
  endpointSlices: V1EndpointSlice[];
  ingresses: V1Ingress[];
  ingressClasses: V1IngressClass[];
  podDisruptionBudgets: V1PodDisruptionBudget[];
  serviceAccounts: V1ServiceAccount[];
  secrets: V1Secret[];
  jobs: V1Job[];
  cronJobs: V1CronJob[];
  persistentVolumeClaims: V1PersistentVolumeClaim[];
  configMaps: V1ConfigMap[];
  events: Array<Record<string, unknown>>;
}

export interface KubernetesConnector {
  collectInventory(): Promise<ClusterInventory>;
}

export class LiveKubernetesConnector implements KubernetesConnector {
  private readonly coreApi: CoreV1Api;
  private readonly appsApi: AppsV1Api;
  private readonly autoscalingApi: AutoscalingV2Api;
  private readonly batchApi: BatchV1Api;
  private readonly discoveryApi: DiscoveryV1Api;
  private readonly networkingApi: NetworkingV1Api;
  private readonly policyApi: PolicyV1Api;
  private readonly kubeConfig: KubeConfig;

  constructor(config: AppConfig) {
    this.kubeConfig = new KubeConfig();

    if (config.KUBECONFIG_PATH) {
      this.kubeConfig.loadFromFile(config.KUBECONFIG_PATH);
    } else {
      this.kubeConfig.loadFromDefault();
    }

    if (config.KUBECONFIG_CONTEXT) {
      this.kubeConfig.setCurrentContext(config.KUBECONFIG_CONTEXT);
    }

    this.coreApi = this.kubeConfig.makeApiClient(CoreV1Api);
    this.appsApi = this.kubeConfig.makeApiClient(AppsV1Api);
    this.autoscalingApi = this.kubeConfig.makeApiClient(AutoscalingV2Api);
    this.batchApi = this.kubeConfig.makeApiClient(BatchV1Api);
    this.discoveryApi = this.kubeConfig.makeApiClient(DiscoveryV1Api);
    this.networkingApi = this.kubeConfig.makeApiClient(NetworkingV1Api);
    this.policyApi = this.kubeConfig.makeApiClient(PolicyV1Api);
  }

  async collectInventory(): Promise<ClusterInventory> {
    const [
      nodes,
      namespaces,
      pods,
      deployments,
      replicaSets,
      statefulSets,
      daemonSets,
      horizontalPodAutoscalers,
      services,
      endpointSlices,
      ingresses,
      ingressClasses,
      podDisruptionBudgets,
      serviceAccounts,
      secrets,
      jobs,
      cronJobs,
      persistentVolumeClaims,
      configMaps,
      events
    ] = await Promise.all([
      this.coreApi.listNode(),
      this.coreApi.listNamespace(),
      this.coreApi.listPodForAllNamespaces(),
      this.appsApi.listDeploymentForAllNamespaces(),
      this.appsApi.listReplicaSetForAllNamespaces(),
      this.appsApi.listStatefulSetForAllNamespaces(),
      this.appsApi.listDaemonSetForAllNamespaces(),
      this.autoscalingApi.listHorizontalPodAutoscalerForAllNamespaces(),
      this.coreApi.listServiceForAllNamespaces(),
      this.discoveryApi.listEndpointSliceForAllNamespaces(),
      this.networkingApi.listIngressForAllNamespaces(),
      this.networkingApi.listIngressClass(),
      this.policyApi.listPodDisruptionBudgetForAllNamespaces(),
      this.coreApi.listServiceAccountForAllNamespaces(),
      this.coreApi.listSecretForAllNamespaces(),
      this.batchApi.listJobForAllNamespaces(),
      this.batchApi.listCronJobForAllNamespaces(),
      this.coreApi.listPersistentVolumeClaimForAllNamespaces(),
      this.coreApi.listConfigMapForAllNamespaces(),
      this.coreApi.listEventForAllNamespaces()
    ]);

    return {
      clusterName: this.kubeConfig.getCurrentContext() || "default-cluster",
      collectedAt: new Date().toISOString(),
      nodes: nodes.items,
      namespaces: namespaces.items,
      pods: pods.items,
      deployments: deployments.items,
      replicaSets: replicaSets.items,
      statefulSets: statefulSets.items,
      daemonSets: daemonSets.items,
      horizontalPodAutoscalers: horizontalPodAutoscalers.items,
      services: services.items,
      endpointSlices: endpointSlices.items,
      ingresses: ingresses.items,
      ingressClasses: ingressClasses.items,
      podDisruptionBudgets: podDisruptionBudgets.items,
      serviceAccounts: serviceAccounts.items,
      secrets: secrets.items,
      jobs: jobs.items,
      cronJobs: cronJobs.items,
      persistentVolumeClaims: persistentVolumeClaims.items,
      configMaps: configMaps.items,
      events: events.items as unknown as Array<Record<string, unknown>>
    };
  }
}
