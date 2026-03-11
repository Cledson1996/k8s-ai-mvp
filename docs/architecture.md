# Architecture

## Overview

The MVP runs locally on an operator workstation connected to the corporate network through VPN. A browser-based frontend calls a local Fastify API. The API is the only layer allowed to access Kubernetes, Prometheus, K8sGPT, and OpenAI.

```text
Browser (Next.js)
  -> Local API (Fastify / TypeScript)
     -> Kubernetes API (read-only kubeconfig)
     -> Prometheus HTTP API
     -> K8sGPT CLI
     -> OpenAI Responses API (optional)
```

## Backend flow

1. Load cluster inventory from Kubernetes.
2. Load usage metrics from Prometheus when configured.
3. Execute `k8sgpt analyze --output json` when available.
4. Normalize data into a single cluster snapshot.
5. Run health and capacity rules.
6. Expose the snapshot through REST endpoints and operator chat.

## Security defaults

- Use a dedicated read-only kubeconfig.
- Do not expose cluster tokens or kubeconfig details to the frontend.
- Do not read Kubernetes secrets in the MVP.
- Suggested actions are advisory only; the application never writes to the cluster.

## V1.1 extensions

- Add security posture checks on top of the same issue model.
- Add cost recommendations using the same workload sizing data.
- Introduce multi-cluster selection without changing the UI information architecture.
