import type { V1ContainerStatus, V1Deployment, V1Pod } from "@kubernetes/client-node";
import type { ResourceRef } from "@k8s-ai-mvp/shared";
import { parseCpu, parseMemory } from "./quantity.js";

export interface WorkloadResourceSummary {
  cpuRequest?: number;
  memoryRequest?: number;
  missingResources: boolean;
}

export function getPodRestartCount(pod: V1Pod): number {
  return (pod.status?.containerStatuses ?? []).reduce(
    (total, status) => total + (status.restartCount ?? 0),
    0
  );
}

export function getPodPrimaryReason(statuses: V1ContainerStatus[] = []): string | undefined {
  for (const status of statuses) {
    const waitingReason = status.state?.waiting?.reason;
    if (waitingReason) {
      return waitingReason;
    }

    const terminatedReason = status.state?.terminated?.reason;
    if (terminatedReason) {
      return terminatedReason;
    }
  }

  return undefined;
}

export function getPodOwner(pod: V1Pod): { kind: string; name: string } | undefined {
  const owner = pod.metadata?.ownerReferences?.[0];
  if (!owner) {
    return undefined;
  }

  if (owner.kind === "ReplicaSet") {
    return {
      kind: "Deployment",
      name: owner.name.replace(/-[a-f0-9]{9,10}$/i, "")
    };
  }

  return {
    kind: owner.kind,
    name: owner.name
  };
}

export function deploymentResourceSummary(deployment: V1Deployment): WorkloadResourceSummary {
  const containers = deployment.spec?.template.spec?.containers ?? [];
  let cpuRequest = 0;
  let memoryRequest = 0;
  let missingResources = false;

  for (const container of containers) {
    const requests = container.resources?.requests;
    const limits = container.resources?.limits;
    const cpu = parseCpu(requests?.cpu?.toString());
    const memory = parseMemory(requests?.memory?.toString());

    if (cpu === undefined || memory === undefined || !limits?.cpu || !limits?.memory) {
      missingResources = true;
    }

    cpuRequest += cpu ?? 0;
    memoryRequest += memory ?? 0;
  }

  return {
    cpuRequest: cpuRequest || undefined,
    memoryRequest: memoryRequest || undefined,
    missingResources
  };
}

export function toResourceRef(kind: string, name: string, namespace?: string, nodeName?: string): ResourceRef {
  return {
    kind,
    name,
    namespace,
    nodeName
  };
}
