import cors from "@fastify/cors";
import Fastify from "fastify";
import { getConfig, type AppConfig } from "./config.js";
import { LiveK8sGptConnector } from "./connectors/k8sgpt.js";
import { LiveKubernetesConnector } from "./connectors/kubernetes.js";
import { LivePrometheusConnector } from "./connectors/prometheus.js";
import {
  LiveAnalysisService,
  type AnalysisService,
} from "./services/analysis/service.js";
import { LiveChatService, type ChatService } from "./services/chat/service.js";
import {
  LiveDeploymentAnalysisService,
  type DeploymentAnalysisService,
} from "./services/deployment-analysis/service.js";
import { SnapshotRepository } from "./services/snapshot/repository.js";

export interface AppServices {
  analysisService: AnalysisService;
  chatService: ChatService;
  deploymentAnalysisService: DeploymentAnalysisService;
}

export function buildServices(config: AppConfig = getConfig()): AppServices {
  const repository = new SnapshotRepository(config.SQLITE_PATH);
  const analysisService = new LiveAnalysisService(
    new LiveKubernetesConnector(config),
    new LivePrometheusConnector(config),
    new LiveK8sGptConnector(config),
    repository,
  );

  return {
    analysisService,
    chatService: new LiveChatService(config),
    deploymentAnalysisService: new LiveDeploymentAnalysisService(
      config,
      analysisService,
      repository,
    ),
  };
}

export async function createApp(services: AppServices = buildServices()) {
  const app = Fastify({
    logger: false,
  });

  await app.register(cors, {
    origin: true,
  });

  app.get("/health", async () => ({
    status: "ok",
  }));

  app.get("/api/overview", async () => {
    const result = await services.analysisService.getLatestOrRun();
    return {
      overview: result.snapshot.overview,
      degradedSources: result.degradedSources,
    };
  });

  app.get("/api/nodes", async () => {
    return services.analysisService.listNodes();
  });

  app.get("/api/issues", async (request) => {
    const result = await services.analysisService.getLatestOrRun();
    const { severity, namespace, source, category } = request.query as {
      severity?: string;
      namespace?: string;
      source?: string;
      category?: string;
    };

    const issues = result.snapshot.issues.filter((issue) => {
      if (severity && issue.severity !== severity) {
        return false;
      }

      if (namespace && issue.resourceRef?.namespace !== namespace) {
        return false;
      }

      if (source && issue.source !== source) {
        return false;
      }

      if (category && issue.category !== category) {
        return false;
      }

      return true;
    });

    return {
      issues,
      degradedSources: result.degradedSources,
    };
  });

  app.get("/api/issues/cleanup", async () => {
    const result = await services.analysisService.getLatestOrRun();
    return {
      issues: result.snapshot.issues.filter(
        (issue) => issue.category === "cleanup",
      ),
      degradedSources: result.degradedSources,
    };
  });

  app.post("/api/analysis/run", async () =>
    services.analysisService.runAnalysis(),
  );

  app.get("/api/namespaces", async () =>
    services.analysisService.listNamespaces(),
  );

  app.get("/api/deployments", async () =>
    services.analysisService.listDeployments(),
  );

  app.get("/api/deployments/metrics", async (request) => {
    const { window } = request.query as { window?: string };
    return services.analysisService.listDeployments(normalizeWindow(window));
  });

  app.get("/api/deployments/:namespace/:name/metrics", async (request, reply) => {
    const { namespace, name } = request.params as { namespace: string; name: string };
    const { window } = request.query as { window?: string };
    const result = await services.analysisService.getDeploymentMetrics(namespace, name, normalizeWindow(window));
    if (!result) {
      reply.code(404);
      return {
        error: "deployment metrics not found",
      };
    }

    return result;
  });

  app.post("/api/deployments/:namespace/:name/analyze", async (request, reply) => {
    const { namespace, name } = request.params as { namespace: string; name: string };
    const result = await services.deploymentAnalysisService.analyzeDeployment(
      namespace,
      name,
    );
    if (!result) {
      reply.code(404);
      return {
        error: "deployment analysis not found",
      };
    }

    return result;
  });

  app.get("/api/deployments/:namespace/:name/analyze", async (request, reply) => {
    const { namespace, name } = request.params as { namespace: string; name: string };
    const result = await services.deploymentAnalysisService.getSavedDeploymentAnalysis(
      namespace,
      name,
    );
    if (!result) {
      reply.code(404);
      return {
        error: "deployment analysis not found",
      };
    }

    return result;
  });

  app.delete("/api/deployments/:namespace/:name/analyze", async (request, reply) => {
    const { namespace, name } = request.params as { namespace: string; name: string };
    const removed = await services.deploymentAnalysisService.clearDeploymentAnalysis(
      namespace,
      name,
    );
    if (!removed) {
      reply.code(404);
      return {
        error: "deployment analysis not found",
      };
    }

    return {
      ok: true,
    };
  });

  app.get("/api/nodes/metrics", async (request) => {
    const { window } = request.query as { window?: string };
    return services.analysisService.listNodes(normalizeWindow(window));
  });

  app.get("/api/nodes/:name/metrics", async (request, reply) => {
    const { name } = request.params as { name: string };
    const { window } = request.query as { window?: string };
    const result = await services.analysisService.getNodeMetrics(name, normalizeWindow(window));
    if (!result) {
      reply.code(404);
      return {
        error: "node metrics not found",
      };
    }

    return result;
  });

  app.get("/api/workloads", async () =>
    services.analysisService.listWorkloads(),
  );

  app.get("/api/namespaces/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    const result = await services.analysisService.getNamespace(name);
    if (!result) {
      reply.code(404);
      return {
        error: "namespace not found",
      };
    }

    return result;
  });

  app.get("/api/resources/:kind/:namespace/:name", async (request, reply) => {
    const { kind, namespace, name } = request.params as {
      kind: string;
      namespace: string;
      name: string;
    };
    const result = await services.analysisService.getResourceDetail(
      kind as never,
      normalizeNamespace(namespace),
      name,
    );
    if (!result) {
      reply.code(404);
      return {
        error: "resource not found",
      };
    }

    return result;
  });

  app.get(
    "/api/resources/:kind/:namespace/:name/relations",
    async (request, reply) => {
      const { kind, namespace, name } = request.params as {
        kind: string;
        namespace: string;
        name: string;
      };
      const result = await services.analysisService.getResourceRelations(
        kind as never,
        normalizeNamespace(namespace),
        name,
      );
      if (!result) {
        reply.code(404);
        return {
          error: "resource not found",
        };
      }

      return result;
    },
  );

  app.get("/api/snapshots", async () =>
    services.analysisService.listSnapshots(),
  );

  app.get("/api/snapshots/:id/diff/:previousId", async (request, reply) => {
    const { id, previousId } = request.params as {
      id: string;
      previousId: string;
    };
    const result = await services.analysisService.getSnapshotDiff(
      id,
      previousId,
    );
    if (!result) {
      reply.code(404);
      return {
        error: "snapshot diff not found",
      };
    }

    return result;
  });

  app.post("/api/chat", async (request, reply) => {
    const body = request.body as { question?: string };
    if (!body?.question?.trim()) {
      reply.code(400);
      return {
        error: "question is required",
      };
    }

    const analysis = await services.analysisService.getLatestOrRun();
    return services.chatService.answerQuestion(body.question, analysis);
  });

  return app;
}

function normalizeNamespace(namespace: string): string | undefined {
  return namespace === "_cluster" ? undefined : namespace;
}

function normalizeWindow(window?: string): "1h" | "6h" | "24h" | "7d" {
  if (window === "1h" || window === "6h" || window === "24h" || window === "7d") {
    return window;
  }
  return "7d";
}
