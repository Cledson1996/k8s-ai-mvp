"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const navigation = [
  { href: "/", label: "Overview", caption: "Saude geral" },
  { href: "/explorer", label: "Explorer", caption: "Namespaces e recursos" },
  { href: "/deployments", label: "Deployments", caption: "Apps, rede e dependencias" },
  { href: "/nodes", label: "Nodes", caption: "Capacidade e pressao" },
  { href: "/issues", label: "Issues", caption: "Diagnosticos e playbooks" },
  { href: "/history", label: "History", caption: "Snapshots e diff" },
  { href: "/chat", label: "Chat", caption: "Pergunte ao cluster" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-[2rem] border border-white/60 bg-white/75 shadow-halo backdrop-blur-xl">
        <header className="border-b border-black/5 px-6 py-6 lg:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.32em] text-tide">
                Kubernetes AI Copilot
              </p>
              <h1 className="mt-3 font-[var(--font-heading)] text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Operacao do cluster com sinais claros, contexto e proximo passo.
              </h1>
              <p className="mt-3 max-w-xl text-sm text-slate-600 sm:text-base">
                Uma estacao local para enxergar saude, pressao, reinicios e
                oportunidades de melhoria sem expor credenciais no front.
              </p>
            </div>

            <div className="rounded-3xl border border-tide/10 bg-ink px-5 py-4 text-white">
              <p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.28em] text-white/60">
                Runtime
              </p>
              <p className="mt-2 text-lg font-semibold">Local + VPN + Read-only</p>
              <p className="mt-1 text-sm text-white/70">
                Web e API fora do cluster, com observabilidade guiada por IA.
              </p>
            </div>
          </div>

          <nav className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            {navigation.map((item) => {
              const active = item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "rounded-2xl border px-4 py-4 transition",
                    active
                      ? "border-tide bg-tide text-white shadow-lg shadow-tide/20"
                      : "border-black/5 bg-white/70 text-slate-700 hover:-translate-y-0.5 hover:border-ember/40 hover:bg-orange-50"
                  )}
                >
                  <div className="font-[var(--font-heading)] text-lg font-semibold">
                    {item.label}
                  </div>
                  <div
                    className={clsx(
                      "mt-1 text-sm",
                      active ? "text-white/80" : "text-slate-500"
                    )}
                  >
                    {item.caption}
                  </div>
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
