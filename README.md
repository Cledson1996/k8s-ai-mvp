# k8s-ai-mvp

Local MVP for Kubernetes observability and AI-assisted operations. The project is organized as an npm workspaces monorepo with a Fastify backend, a Next.js frontend, and shared TypeScript types.

## What the MVP does

- Reads cluster inventory using a read-only kubeconfig.
- Pulls CPU and memory usage from Prometheus when available.
- Runs `k8sgpt` diagnostics when installed locally.
- Consolidates issues with severity, evidence, recommendations, and manual playbooks.
- Exposes four browser views: Overview, Nodes, Issues, and Chat.

## Workspace layout

```text
apps/
  api/        Fastify API, cluster connectors, analysis engine
  web/        Next.js dashboard
packages/
  shared/     Shared TypeScript types
docs/
  architecture.md
```

## Requirements

- Node.js 22+
- npm 10+
- `kubectl`
- VPN access to the target Kubernetes cluster
- A dedicated read-only `kubeconfig`
- Optional:
  - Prometheus base URL
  - `k8sgpt` binary in PATH
  - OpenAI API key

## Setup

1. Copy `.env.example` to `.env`.
2. Fill `KUBECONFIG_PATH`, `KUBECONFIG_CONTEXT`, and `PROMETHEUS_BASE_URL`.
3. Install dependencies:

```bash
npm install
```

4. Run the API and web app:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Environment variables

- `API_PORT`: local API port.
- `WEB_PORT`: preferred web port for local runs.
- `NEXT_PUBLIC_API_BASE_URL`: browser-visible API base URL.
- `KUBECONFIG_PATH`: absolute path to the read-only kubeconfig file.
- `KUBECONFIG_CONTEXT`: optional kubeconfig context name.
- `PROMETHEUS_BASE_URL`: Prometheus base URL, for example `https://prometheus.internal`.
- `K8SGPT_COMMAND`: command used to launch `k8sgpt`.
- `OPENAI_API_KEY`: optional OpenAI key for richer chat phrasing.
- `OPENAI_MODEL`: OpenAI model for chat synthesis.

## API surface

- `GET /health`
- `GET /api/overview`
- `GET /api/nodes`
- `GET /api/issues`
- `POST /api/analysis/run`
- `POST /api/chat`

## Testing

```bash
npm test
```

The backend includes rule and endpoint tests. The frontend includes component flow tests with mocked API responses.

## Notes

- The MVP is read-only by design.
- If Prometheus is unavailable, the API still returns Kubernetes-based analysis and marks Prometheus as degraded.
- If `k8sgpt` is unavailable, the API omits that source and continues running.
