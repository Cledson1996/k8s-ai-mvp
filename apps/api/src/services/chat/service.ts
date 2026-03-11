import type { ChatAnswer } from "@k8s-ai-mvp/shared";
import OpenAI from "openai";
import type { AppConfig } from "../../config.js";
import type { AnalysisResult } from "../analysis/service.js";

export interface ChatService {
  answerQuestion(question: string, analysis: AnalysisResult): Promise<ChatAnswer>;
}

export class LiveChatService implements ChatService {
  private readonly client?: OpenAI;
  private readonly model?: string;

  constructor(config: AppConfig) {
    if (config.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      this.model = config.OPENAI_MODEL;
    }
  }

  async answerQuestion(question: string, analysis: AnalysisResult): Promise<ChatAnswer> {
    const heuristic = buildHeuristicAnswer(question, analysis);
    if (!this.client || !this.model) {
      return heuristic;
    }

    try {
      const response = await this.client.responses.create({
        model: this.model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are an SRE assistant. Answer only from the provided cluster snapshot. Never suggest automatic writes to the cluster."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  question,
                  overview: analysis.snapshot.overview,
                  topIssues: analysis.snapshot.issues.slice(0, 8),
                  topNodes: analysis.snapshot.nodes.slice(0, 5),
                  topNamespaces: analysis.snapshot.namespaces.slice(0, 5),
                  topPods: analysis.snapshot.pods.slice(0, 5)
                })
              }
            ]
          }
        ]
      });

      return {
        ...heuristic,
        answer: response.output_text?.trim() || heuristic.answer
      };
    } catch {
      return heuristic;
    }
  }
}

function buildHeuristicAnswer(question: string, analysis: AnalysisResult): ChatAnswer {
  const normalized = question.toLowerCase();
  const generatedAt = new Date().toISOString();

  if (normalized.includes("reinici")) {
    const pods = analysis.snapshot.overview.topRestarts.slice(0, 3);
    return {
      answer:
        pods.length > 0
          ? `Os pods com mais reinícios agora são ${pods
              .map((pod) => `${pod.namespace}/${pod.name} (${pod.restarts})`)
              .join(", ")}.`
          : "Não encontrei pods com reinícios relevantes no snapshot atual.",
      citations: pods.map((pod) => ({
        type: "pod",
        label: `${pod.namespace}/${pod.name}`
      })),
      suggestedFollowUps: [
        "Quais issues estão ligados a esses pods?",
        "Mostre os namespaces com mais falhas."
      ],
      generatedAt
    };
  }

  if (normalized.includes("namespace") && normalized.includes("mem")) {
    const namespaces = analysis.snapshot.namespaces.slice(0, 3);
    return {
      answer:
        namespaces.length > 0
          ? `Os namespaces com maior uso de memória são ${namespaces.map((item) => item.name).join(", ")}.`
          : "Não encontrei métricas de memória por namespace neste momento.",
      citations: namespaces.map((item) => ({
        type: "namespace",
        label: item.name
      })),
      suggestedFollowUps: [
        "Quais workloads lideram esse consumo?",
        "Há requests/limits ausentes nesses namespaces?"
      ],
      generatedAt
    };
  }

  if (normalized.includes("request") || normalized.includes("limit")) {
    const issues = analysis.snapshot.issues.filter((issue) => issue.id.includes("missing-resources")).slice(0, 5);
    return {
      answer:
        issues.length > 0
          ? `Encontrei ${issues.length} workloads sem requests/limits completos, incluindo ${issues
              .slice(0, 3)
              .map((issue) => `${issue.resourceRef?.namespace}/${issue.resourceRef?.name}`)
              .join(", ")}.`
          : "Não encontrei achados sobre requests/limits incompletos no snapshot atual.",
      citations: issues.map((issue) => ({
        type: "issue",
        label: issue.title,
        issueId: issue.id
      })),
      suggestedFollowUps: [
        "Mostre os playbooks para corrigir esses deployments.",
        "Quais deles estão consumindo mais CPU?"
      ],
      generatedAt
    };
  }

  if (normalized.includes("node") || normalized.includes("carreg")) {
    const nodes = [...analysis.snapshot.nodes]
      .sort((left, right) => (right.usage.cpuPercent ?? 0) - (left.usage.cpuPercent ?? 0))
      .slice(0, 3);

    return {
      answer:
        nodes.length > 0
          ? `Os nodes mais carregados por CPU agora são ${nodes
              .map((node) => `${node.name} (${Math.round(node.usage.cpuPercent ?? 0)}%)`)
              .join(", ")}.`
          : "Não encontrei dados suficientes para ranquear os nodes.",
      citations: nodes.map((node) => ({
        type: "node",
        label: node.name
      })),
      suggestedFollowUps: [
        "Quais workloads estão pesando nesses nodes?",
        "Há pressão de memória ou disco?"
      ],
      generatedAt
    };
  }

  const topIssues = analysis.snapshot.issues.slice(0, 3);
  return {
    answer:
      topIssues.length > 0
        ? `Os problemas mais urgentes agora são ${topIssues.map((issue) => issue.title).join("; ")}.`
        : "O snapshot atual não trouxe problemas prioritários.",
    citations: topIssues.map((issue) => ({
      type: "issue",
      label: issue.title,
      issueId: issue.id
    })),
    suggestedFollowUps: [
      "Mostre os pods com mais reinícios.",
      "Quais namespaces usam mais memória?"
    ],
    generatedAt
  };
}
