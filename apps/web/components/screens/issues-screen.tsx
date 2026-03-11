"use client";

import { useMemo, useState } from "react";
import type { AnalysisSource, Issue, Severity } from "@k8s-ai-mvp/shared";
import { SectionCard } from "../ui/section-card";
import { SeverityPill, SourcePill } from "../ui/status-pill";
import { StateBanner } from "../ui/state-banner";

export function IssuesScreen({
  issues,
  degradedSources
}: {
  issues: Issue[];
  degradedSources: string[];
}) {
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<AnalysisSource | "all">("all");

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const severityMatches =
        severityFilter === "all" || issue.severity === severityFilter;
      const sourceMatches = sourceFilter === "all" || issue.source === sourceFilter;
      return severityMatches && sourceMatches;
    });
  }, [issues, severityFilter, sourceFilter]);

  return (
    <div className="space-y-6">
      {degradedSources.length > 0 ? (
        <StateBanner
          tone="warning"
          title="Analise parcial"
          body={`As fontes ${degradedSources.join(", ")} falharam na ultima execucao. Os issues abaixo mostram apenas os dados disponiveis.`}
        />
      ) : null}

      <SectionCard
        eyebrow="Issue radar"
        title="Achados consolidados"
        description="Diagnosticos combinados entre regras proprias, Prometheus e K8sGPT."
      >
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-600">
            Severidade
            <select
              aria-label="Filtrar por severidade"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={severityFilter}
              onChange={(event) =>
                setSeverityFilter(event.target.value as Severity | "all")
              }
            >
              <option value="all">Todas</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-600">
            Origem
            <select
              aria-label="Filtrar por origem"
              className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3"
              value={sourceFilter}
              onChange={(event) =>
                setSourceFilter(event.target.value as AnalysisSource | "all")
              }
            >
              <option value="all">Todas</option>
              <option value="rule">Rule</option>
              <option value="prometheus">Prometheus</option>
              <option value="k8sgpt">K8sGPT</option>
            </select>
          </label>
        </div>

        <div className="space-y-4">
          {filteredIssues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="rounded-[1.75rem] border border-black/5 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityPill severity={issue.severity} />
            <SourcePill source={issue.source} />
          </div>
          <h3 className="mt-3 font-[var(--font-heading)] text-2xl font-semibold text-ink">
            {issue.title}
          </h3>
          <p className="mt-2 text-sm text-slate-600">{issue.summary}</p>
          <p className="mt-3 text-sm text-slate-500">
            Recomendacao:{" "}
            <span className="font-medium text-ink">{issue.recommendation}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
        >
          {expanded ? "Ocultar playbook" : "Ver playbook"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-3xl bg-orange-50 p-4">
            <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-slate-500">
              Evidencias
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {issue.evidence.map((evidence) => (
                <li key={`${issue.id}-${evidence.label}`}>
                  <span className="font-semibold text-ink">{evidence.label}:</span>{" "}
                  {evidence.value}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl bg-ink p-4 text-white">
            <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
              Playbook sugerido
            </p>
            <ol className="mt-3 space-y-3">
              {issue.playbook.map((step) => (
                <li key={`${issue.id}-${step.title}`} className="rounded-2xl border border-white/10 px-4 py-3">
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-1 text-sm text-white/70">{step.detail}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-2xl bg-black/20 p-4">
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Comandos sugeridos
              </p>
              <div className="mt-3 space-y-2">
                {issue.suggestedCommands.map((command) => (
                  <code
                    key={`${issue.id}-${command}`}
                    className="block overflow-x-auto rounded-2xl bg-black/30 px-4 py-3 font-[var(--font-mono)] text-xs text-glow"
                  >
                    {command}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
