import type { Issue } from "@k8s-ai-mvp/shared";
import { ChatPanel } from "../chat-panel";
import { SectionCard } from "../ui/section-card";

export function ChatScreen({
  suggestedQuestions,
  issues
}: {
  suggestedQuestions: string[];
  issues: Issue[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <SectionCard
        eyebrow="Prompt starters"
        title="Perguntas que ajudam no dia a dia"
        description="Use o snapshot mais recente para orientar triagem, tuning e proximos passos."
      >
        <div className="space-y-3">
          {suggestedQuestions.map((question) => (
            <div
              key={question}
              className="rounded-3xl border border-black/5 bg-orange-50 px-4 py-4 text-sm text-slate-700"
            >
              {question}
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-3xl bg-ink p-5 text-white">
          <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
            Contexto recente
          </p>
          <div className="mt-4 space-y-3">
            {issues.slice(0, 3).map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl border border-white/10 px-4 py-3"
              >
                <p className="font-semibold">{issue.title}</p>
                <p className="mt-1 text-sm text-white/70">{issue.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <ChatPanel suggestedQuestions={suggestedQuestions} />
    </div>
  );
}
