"use client";

import { useState, useTransition } from "react";
import type { ChatAnswer } from "@k8s-ai-mvp/shared";
import { postChatQuestion } from "../lib/api-client";
import { SectionCard } from "./ui/section-card";
import { StateBanner } from "./ui/state-banner";

export function ChatPanel({
  suggestedQuestions
}: {
  suggestedQuestions: string[];
}) {
  const [question, setQuestion] = useState(suggestedQuestions[0] ?? "");
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!question.trim()) {
      setError("Digite uma pergunta antes de consultar o cluster.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const response = await postChatQuestion(question);
        setAnswer(response);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Nao foi possivel consultar o backend."
        );
      }
    });
  };

  return (
    <SectionCard
      eyebrow="Cluster chat"
      title="Pergunte ao cluster"
      description="Respostas com evidencias, citacoes e proximas perguntas sugeridas."
      className="h-full"
    >
      <div className="space-y-4">
        <label className="block space-y-2 text-sm text-slate-600">
          Pergunta
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ex.: quais pods estao reiniciando mais?"
            className="min-h-32 w-full rounded-[1.5rem] border border-black/10 bg-white px-4 py-4 text-base text-ink outline-none transition focus:border-ember focus:ring-4 focus:ring-ember/10"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setQuestion(item)}
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm text-slate-600 transition hover:border-tide hover:text-tide"
            >
              {item}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-full bg-ember px-5 py-3 font-medium text-white transition hover:bg-[#d45d36] disabled:cursor-wait disabled:opacity-70"
        >
          {isPending ? "Consultando..." : "Consultar cluster"}
        </button>

        {error ? (
          <StateBanner title="Falha ao consultar" body={error} tone="warning" />
        ) : null}

        {answer ? (
          <div className="space-y-4 rounded-[1.75rem] bg-ink p-5 text-white">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Resposta
              </p>
              <p className="mt-3 text-base leading-7 text-white/90">{answer.answer}</p>
            </div>

            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Citacoes
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {answer.citations.map((citation) => (
                  <span
                    key={`${citation.type}-${citation.label}`}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80"
                  >
                    {citation.type}: {citation.label}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Proximas perguntas
              </p>
              <ul className="mt-3 space-y-2 text-sm text-white/80">
                {answer.suggestedFollowUps.map((followUp) => (
                  <li key={followUp}>{followUp}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
