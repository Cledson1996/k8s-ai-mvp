import type { ChatAnswer, ChatRequest } from "@k8s-ai-mvp/shared";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export async function postChatQuestion(question: string): Promise<ChatAnswer> {
  const payload: ChatRequest = { question };

  const response = await fetch(`${apiBaseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("O backend nao conseguiu responder a pergunta.");
  }

  return (await response.json()) as ChatAnswer;
}
