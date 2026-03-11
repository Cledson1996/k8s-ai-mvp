import cors from "@fastify/cors";
import Fastify from "fastify";
import { getConfig, type AppConfig } from "./config.js";
import { LiveK8sGptConnector } from "./connectors/k8sgpt.js";
import { LiveKubernetesConnector } from "./connectors/kubernetes.js";
import { LivePrometheusConnector } from "./connectors/prometheus.js";
import { LiveAnalysisService, type AnalysisService } from "./services/analysis/service.js";
import { LiveChatService, type ChatService } from "./services/chat/service.js";

export interface AppServices {
  analysisService: AnalysisService;
  chatService: ChatService;
}

export function buildServices(config: AppConfig = getConfig()): AppServices {
  const analysisService = new LiveAnalysisService(
    new LiveKubernetesConnector(config),
    new LivePrometheusConnector(config),
    new LiveK8sGptConnector(config)
  );

  return {
    analysisService,
    chatService: new LiveChatService(config)
  };
}

export async function createApp(services: AppServices = buildServices()) {
  const app = Fastify({
    logger: false
  });

  await app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    status: "ok"
  }));

  app.get("/api/overview", async () => {
    const result = await services.analysisService.getLatestOrRun();
    return {
      overview: result.snapshot.overview,
      degradedSources: result.degradedSources
    };
  });

  app.get("/api/nodes", async () => {
    const result = await services.analysisService.getLatestOrRun();
    return {
      nodes: result.snapshot.nodes,
      degradedSources: result.degradedSources
    };
  });

  app.get("/api/issues", async (request) => {
    const result = await services.analysisService.getLatestOrRun();
    const { severity, namespace, source } = request.query as {
      severity?: string;
      namespace?: string;
      source?: string;
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

      return true;
    });

    return {
      issues,
      degradedSources: result.degradedSources
    };
  });

  app.post("/api/analysis/run", async () => services.analysisService.runAnalysis());

  app.post("/api/chat", async (request, reply) => {
    const body = request.body as { question?: string };
    if (!body?.question?.trim()) {
      reply.code(400);
      return {
        error: "question is required"
      };
    }

    const analysis = await services.analysisService.getLatestOrRun();
    return services.chatService.answerQuestion(body.question, analysis);
  });

  return app;
}
