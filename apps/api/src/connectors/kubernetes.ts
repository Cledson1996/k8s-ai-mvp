import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  type V1Deployment,
  type V1Namespace,
  type V1Node,
  type V1Pod
} from "@kubernetes/client-node";
import type { AppConfig } from "../config.js";

export interface ClusterInventory {
  clusterName: string;
  collectedAt: string;
  nodes: V1Node[];
  namespaces: V1Namespace[];
  pods: V1Pod[];
  deployments: V1Deployment[];
  events: Array<Record<string, unknown>>;
}

export interface KubernetesConnector {
  collectInventory(): Promise<ClusterInventory>;
}

export class LiveKubernetesConnector implements KubernetesConnector {
  private readonly coreApi: CoreV1Api;
  private readonly appsApi: AppsV1Api;
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
  }

  async collectInventory(): Promise<ClusterInventory> {
    const [nodes, namespaces, pods, deployments, events] = await Promise.all([
      this.coreApi.listNode(),
      this.coreApi.listNamespace(),
      this.coreApi.listPodForAllNamespaces(),
      this.appsApi.listDeploymentForAllNamespaces(),
      this.coreApi.listEventForAllNamespaces()
    ]);

    return {
      clusterName: this.kubeConfig.getCurrentContext() || "default-cluster",
      collectedAt: new Date().toISOString(),
      nodes: nodes.items,
      namespaces: namespaces.items,
      pods: pods.items,
      deployments: deployments.items,
      events: events.items as unknown as Array<Record<string, unknown>>
    };
  }
}
