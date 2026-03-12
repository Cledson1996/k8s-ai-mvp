"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  NodeAnalysisRelatedResource,
  NodeAnalysisResponse,
  SuggestedYamlPatch,
} from "../../lib/explorer-types";
import {
  analyzeNode,
  clearNodeAnalysis,
  getSavedNodeAnalysis,
} from "../../lib/node-analysis-api";
import { buildResourceHref } from "../../lib/routes";
import { ModalPortal } from "./modal-portal";
import { StateBanner } from "./state-banner";
import { SeverityPill } from "./status-pill";

export function NodeAnalysisDrawer({
  name,
  onClose,
}: {
  name: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<NodeAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"reanalyze" | "clear" | null>(null);
  const [yamlTarget, setYamlTarget] = useState<{ title: string; yaml?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await getSavedNodeAnalysis(name);
        if (!cancelled) {
          setData(response);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setError(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [name]);

  const relatedResources = useMemo(() => data?.relatedResources ?? [], [data]);

  async function handleAnalyze() {
    setBusyAction("reanalyze");
    setError(null);
    try {
      const response = await analyzeNode(name);
      setData(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel gerar a analise do node.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClear() {
    setBusyAction("clear");
    setError(null);
    try {
      await clearNodeAnalysis(name);
      setData(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel limpar a analise salva.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose} />
      <aside className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
        <div className="flex h-[80vh] max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#f7f5ef] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 bg-white px-5 py-4">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                Analise do node
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
                {name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Capacidade, estabilidade, distribuicao e qualidade dos workloads.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="mb-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleAnalyze()}
                disabled={busyAction === "reanalyze"}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide disabled:cursor-wait disabled:opacity-60"
              >
                {busyAction === "reanalyze"
                  ? "Analisando..."
                  : data
                    ? "Fazer nova analise"
                    : "Analisar agora"}
              </button>
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={!data || busyAction === "clear"}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyAction === "clear" ? "Limpando..." : "Limpar analise"}
              </button>
            </div>

            {loading ? (
              <SurfaceCard title="Carregando analise salva">
                <p className="text-sm text-slate-600">
                  Lendo o node, os workloads hospedados, o historico e os sinais atuais do cluster...
                </p>
              </SurfaceCard>
            ) : error ? (
              <SurfaceCard title="Falha ao analisar">
                <p className="text-sm text-slate-600">{error}</p>
              </SurfaceCard>
            ) : data ? (
              <div className="space-y-5">
                {data.degradedSources.length > 0 ? (
                  <StateBanner
                    tone="warning"
                    title="Analise parcial"
                    body={`As fontes ${data.degradedSources.join(", ")} nao responderam completamente nesta execucao.`}
                  />
                ) : null}

                <SurfaceCard title="Resumo executivo">
                  <div className="flex flex-wrap items-center gap-3">
                    <RiskPill risk={data.overallRisk} />
                    <span className="rounded-full border border-black/5 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                      {data.usedSources.join(" + ")}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-700">
                    {data.executiveSummary}
                  </p>
                </SurfaceCard>

                <SurfaceCard title="Scorecards">
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.scorecards.map((scorecard) => (
                      <div
                        key={scorecard.category}
                        className="rounded-3xl border border-black/5 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-ink">{scorecard.label}</p>
                          <RiskPill risk={scorecard.risk} />
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{scorecard.summary}</p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard title="Achados">
                  <div className="space-y-3">
                    {data.findings.map((finding) => {
                      const resourceHref = buildResourceHref(
                        finding.resource.kind,
                        finding.resource.namespace ?? "_cluster",
                        finding.resource.name,
                      );
                      const related = findRelatedResource(relatedResources, finding.resource);

                      return (
                        <div
                          key={finding.id}
                          className="rounded-[1.5rem] border border-black/5 bg-slate-50 p-4"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityPill severity={finding.severity} />
                            <span className="rounded-full border border-black/5 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                              {finding.category}
                            </span>
                          </div>
                          <p className="mt-3 font-medium text-ink">{finding.title}</p>
                          <p className="mt-2 text-sm text-slate-600">{finding.impact}</p>
                          <p className="mt-2 text-sm text-slate-700">
                            Recomendacao: {finding.recommendation}
                          </p>
                          {finding.evidence.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {finding.evidence.map((item) => (
                                <span
                                  key={`${finding.id}-${item.label}`}
                                  className="rounded-full border border-black/5 bg-white px-3 py-1 text-xs text-slate-600"
                                >
                                  {item.label}: {item.value}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Link
                              href={resourceHref}
                              className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
                            >
                              Abrir recurso
                            </Link>
                            {related?.manifestYaml ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setYamlTarget({
                                    title: `${related.kind} ${related.name}`,
                                    yaml: related.manifestYaml,
                                  })
                                }
                                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                              >
                                Ver YAML
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </SurfaceCard>

                <SurfaceCard title="Melhorias sugeridas">
                  <div className="space-y-3">
                    {data.improvements.map((improvement) => (
                      <div
                        key={improvement.id}
                        className="rounded-3xl border border-black/5 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityPill severity={improvement.priority} />
                          <p className="font-medium text-ink">{improvement.title}</p>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">{improvement.summary}</p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard title="Recursos relacionados">
                  <div className="space-y-3">
                    {relatedResources.map((resource) => (
                      <div
                        key={resource.key}
                        className="rounded-3xl border border-black/5 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-ink">
                              {resource.kind}: {resource.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {resource.role} {resource.status ? `| ${resource.status}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={buildResourceHref(
                                resource.kind,
                                resource.namespace ?? "_cluster",
                                resource.name,
                              )}
                              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                            >
                              Abrir
                            </Link>
                            {resource.manifestYaml ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setYamlTarget({
                                    title: `${resource.kind} ${resource.name}`,
                                    yaml: resource.manifestYaml,
                                  })
                                }
                                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                              >
                                Ver YAML
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{resource.summary}</p>
                      </div>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard title="Comandos de revisao">
                  <div className="space-y-2">
                    {data.reviewCommands.map((command) => (
                      <pre
                        key={command}
                        className="overflow-x-auto rounded-3xl bg-[#04101d] px-4 py-3 font-[var(--font-mono)] text-xs text-[#dff7ff]"
                      >
                        <code>{command}</code>
                      </pre>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard title="YAML sugerido">
                  <div className="space-y-3">
                    {data.suggestedYamlPatches.length > 0 ? (
                      data.suggestedYamlPatches.map((patch) => (
                        <YamlPatchCard
                          key={`${patch.resource.kind}-${patch.resource.namespace ?? "_cluster"}-${patch.resource.name}-${patch.reason}`}
                          patch={patch}
                          onOpen={(title, yaml) => setYamlTarget({ title, yaml })}
                        />
                      ))
                    ) : (
                      <EmptyMessage>
                        Nenhum YAML sugerido foi necessario nesta analise.
                      </EmptyMessage>
                    )}
                  </div>
                </SurfaceCard>
              </div>
            ) : (
              <SurfaceCard title="Nenhuma analise salva">
                <p className="text-sm leading-7 text-slate-600">
                  Este node ainda nao tem analise guardada. Clique em{" "}
                  <strong>Analisar agora</strong> para gerar e salvar uma nova.
                </p>
              </SurfaceCard>
            )}
          </div>
        </div>
      </aside>

      {yamlTarget ? (
        <YamlModal
          title={yamlTarget.title}
          yaml={yamlTarget.yaml}
          onClose={() => setYamlTarget(null)}
        />
      ) : null}
    </ModalPortal>
  );
}

function RiskPill({ risk }: { risk: NodeAnalysisResponse["overallRisk"] }) {
  const map = {
    healthy: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-900",
    critical: "bg-rose-100 text-rose-800",
  } as const;

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${map[risk]}`}>
      {risk}
    </span>
  );
}

function SurfaceCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-black/5 bg-white/80 p-5">
      <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/10 bg-slate-50 px-4 py-5 text-sm text-slate-500">
      {children}
    </div>
  );
}

function YamlPatchCard({
  patch,
  onOpen,
}: {
  patch: SuggestedYamlPatch;
  onOpen: (title: string, yaml: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-black/5 bg-slate-50 px-4 py-4">
      <p className="font-medium text-ink">
        {patch.resource.kind}: {patch.resource.name}
      </p>
      <p className="mt-2 text-sm text-slate-600">{patch.reason}</p>
      <p className="mt-2 text-sm text-slate-500">{patch.note}</p>
      <button
        type="button"
        onClick={() =>
          onOpen(`${patch.resource.kind} ${patch.resource.name}`, patch.yaml)
        }
        className="mt-4 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
      >
        Abrir YAML sugerido
      </button>
    </div>
  );
}

function YamlModal({
  title,
  yaml,
  onClose,
}: {
  title: string;
  yaml?: string;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
        <div className="flex h-[80vh] max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                Manifesto do recurso
              </p>
              <h4 className="mt-2 text-2xl font-semibold text-ink">{title}</h4>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Fechar
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#03111d] px-5 py-5">
            {yaml ? (
              <pre className="overflow-x-auto rounded-3xl bg-[#041a2b] p-4 font-[var(--font-mono)] text-xs leading-7 text-[#dff7ff]">
                <code>{yaml}</code>
              </pre>
            ) : (
              <div className="rounded-3xl border border-white/10 bg-[#041a2b] px-4 py-5 text-sm text-white/75">
                O YAML bruto ainda nao esta disponivel para este recurso nesta coleta.
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function findRelatedResource(
  resources: NodeAnalysisRelatedResource[],
  target: { kind: string; namespace?: string; name: string },
) {
  return resources.find(
    (resource) =>
      resource.kind === target.kind &&
      resource.name === target.name &&
      (resource.namespace ?? "_cluster") === (target.namespace ?? "_cluster"),
  );
}
