"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type {
  DeploymentAnalysisRelatedResource,
  DeploymentAnalysisResponse,
  SuggestedYamlPatch,
} from "../../lib/explorer-types";
import {
  analyzeDeployment,
  clearDeploymentAnalysis,
  getSavedDeploymentAnalysis,
} from "../../lib/deployment-analysis-api";
import { buildResourceHref } from "../../lib/routes";
import { ModalPortal } from "./modal-portal";
import { StateBanner } from "./state-banner";
import { SeverityPill } from "./status-pill";

export function DeploymentAnalysisDrawer({
  namespace,
  name,
  onClose,
}: {
  namespace: string;
  name: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DeploymentAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"reanalyze" | "clear" | null>(null);
  const [yamlTarget, setYamlTarget] = useState<{
    title: string;
    yaml?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await getSavedDeploymentAnalysis(namespace, name);
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
  }, [namespace, name]);

  const relatedResources = useMemo(
    () => data?.relatedResources ?? [],
    [data],
  );

  async function handleAnalyze() {
    setBusyAction("reanalyze");
    setError(null);
    try {
      const response = await analyzeDeployment(namespace, name);
      setData(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nao foi possivel gerar uma nova analise.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClear() {
    setBusyAction("clear");
    setError(null);
    try {
      await clearDeploymentAnalysis(namespace, name);
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
      <div
        className="fixed inset-0 z-50 bg-black/45"
        onClick={onClose}
      />
      <aside className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6">
        <div className="flex h-[80vh] max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-[#f7f5ef] shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-black/5 bg-white px-5 py-4">
            <div>
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                Analise do deployment
              </p>
              <h3 className="mt-2 font-[var(--font-heading)] text-2xl font-semibold text-ink">
                {name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">Namespace: {namespace}</p>
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
                  Lendo YAML, histórico do Prometheus, dependências e sinais atuais do cluster...
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
                                YAML
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
                        className="overflow-x-auto rounded-2xl bg-ink px-4 py-3 text-sm text-white"
                      >
                        <code>{command}</code>
                      </pre>
                    ))}
                  </div>
                </SurfaceCard>

                <SurfaceCard title="YAML sugerido">
                  <div className="space-y-3">
                    {data.suggestedYamlPatches.map((patch) => (
                      <SuggestedYamlCard
                        key={`${patch.resource.kind}-${patch.resource.namespace ?? "_cluster"}-${patch.resource.name}-${patch.reason}`}
                        patch={patch}
                        onOpenYaml={() =>
                          setYamlTarget({
                            title: `${patch.resource.kind} ${patch.resource.name} sugerido`,
                            yaml: patch.yaml,
                          })
                        }
                      />
                    ))}
                  </div>
                </SurfaceCard>
              </div>
            ) : (
              <SurfaceCard title="Nenhuma analise salva">
                <p className="text-sm text-slate-600">
                  Este deployment ainda nao tem analise guardada. Clique em
                  {" "}
                  <span className="font-medium text-ink">Analisar agora</span>
                  {" "}
                  para gerar e salvar uma nova.
                </p>
              </SurfaceCard>
            )}
          </div>
        </div>
      </aside>

      {yamlTarget ? (
        <YamlPreviewModal
          title={yamlTarget.title}
          yaml={yamlTarget.yaml}
          onClose={() => setYamlTarget(null)}
        />
      ) : null}
    </ModalPortal>
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
    <section className="rounded-[1.5rem] border border-black/5 bg-white p-4">
      <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SuggestedYamlCard({
  patch,
  onOpenYaml,
}: {
  patch: SuggestedYamlPatch;
  onOpenYaml: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-black/5 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink">
            {patch.resource.kind}: {patch.resource.name}
          </p>
          <p className="mt-1 text-sm text-slate-600">{patch.reason}</p>
        </div>
        <button
          type="button"
          onClick={onOpenYaml}
          className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-tide"
        >
          Ver YAML sugerido
        </button>
      </div>
      <p className="mt-3 text-sm text-slate-500">{patch.note}</p>
    </div>
  );
}

function RiskPill({ risk }: { risk: "healthy" | "warning" | "critical" }) {
  const tones = {
    healthy: "border-emerald-200 bg-emerald-100 text-emerald-700",
    warning: "border-amber-200 bg-amber-100 text-amber-700",
    critical: "border-rose-200 bg-rose-100 text-rose-700",
  } as const;

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.24em] ${tones[risk]}`}
    >
      {risk}
    </span>
  );
}

function findRelatedResource(
  resources: DeploymentAnalysisRelatedResource[],
  resource: { kind: string; namespace?: string; name: string },
) {
  return resources.find(
    (item) =>
      item.kind === resource.kind &&
      item.name === resource.name &&
      (item.namespace ?? "_cluster") === (resource.namespace ?? "_cluster"),
  );
}

function YamlPreviewModal({
  title,
  yaml,
  onClose,
}: {
  title: string;
  yaml?: string;
  onClose: () => void;
}) {
  const lines = (yaml ?? "").replace(/\r\n/g, "\n").split("\n");

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-4 py-6" onClick={onClose}>
        <div className="w-full max-w-5xl">
          <div
            className="flex h-[80vh] max-h-[80vh] w-full flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-black/5 px-5 py-4">
              <div>
                <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.24em] text-slate-500">
                  YAML
                </p>
                <h3 className="mt-2 font-[var(--font-heading)] text-xl font-semibold text-ink">{title}</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-ink px-5 py-5">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#06111d]">
                <table className="min-w-full border-separate border-spacing-0">
                  <tbody>
                    {lines.map((line, index) => (
                      <tr key={`${index}-${line}`} className="align-top odd:bg-white/[0.02]">
                        <td className="select-none border-r border-white/5 px-4 py-1 text-right font-[var(--font-mono)] text-xs text-white/30">
                          {index + 1}
                        </td>
                        <td className="px-4 py-1 font-[var(--font-mono)] text-sm text-white/90 whitespace-pre-wrap break-words">
                          {line || " "}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
