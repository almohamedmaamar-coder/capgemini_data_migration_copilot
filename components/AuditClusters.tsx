"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { Layers, AlertCircle, Copy, Link2, CheckCircle2, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Severity } from "@/types/quality";

export interface AuditCluster {
  id: string;
  rule: "R1" | "R2" | "R3";
  title: string;
  column?: string;
  count: number;
  severity: Severity;
  explanation: string;
  rowIds: string[];
}

export default function AuditClusters() {
  const { report, activeSheet, activeClusterId, setActiveClusterId } = useStore();

  const clusters = useMemo<AuditCluster[]>(() => {
    if (!report) return [];
    const issues = report.issues.filter((i) => !activeSheet || i.sheet === activeSheet);

    const map = new Map<string, AuditCluster>();

    issues.forEach((issue) => {
      let clusterKey = "";
      let title = "";
      let explanation = "";

      if (issue.rule === "R1") {
        const col = issue.field || "Champ obligatoire";
        clusterKey = `r1_${col}`;
        title = `Champ obligatoire « ${col} » manquant`;
        explanation = `Ce champ ne doit jamais être vide dans SAP. Toute case vide provoquera un rejet lors de la simulation Cockpit.`;
      } else if (issue.rule === "R2") {
        clusterKey = "r2_consistency";
        title = `Incohérence inter-feuilles (Master Record introuvable)`;
        explanation = `L'identifiant utilisé dans cette feuille n'existe pas dans la table maîtresse. SAP rejettera l'affectation.`;
      } else if (issue.rule === "R3") {
        clusterKey = "r3_duplicate";
        title = `Doublon d'identifiant (Clé dupliquée)`;
        explanation = `Plusieurs lignes partagent la même clé unique. SAP n'autorise qu'un seul enregistrement par clé.`;
      } else {
        clusterKey = `other_${issue.rule}`;
        title = `Anomalie ${issue.rule}`;
        explanation = issue.message;
      }

      if (!map.has(clusterKey)) {
        map.set(clusterKey, {
          id: clusterKey,
          rule: issue.rule,
          title,
          column: issue.field,
          count: 0,
          severity: issue.severity,
          explanation,
          rowIds: [],
        });
      }

      const cluster = map.get(clusterKey)!;
      cluster.count++;
      if (!cluster.rowIds.includes(issue.rowId)) {
        cluster.rowIds.push(issue.rowId);
      }
    });

    // Si l'agent autonome LangGraph a formulé des diagnostics de grappes, on les injecte
    if (report.agentSynthesis?.clusters) {
      report.agentSynthesis.clusters.forEach((aiCluster) => {
        const existing =
          map.get(aiCluster.id) ||
          Array.from(map.values()).find((c) => c.rule === aiCluster.rule);
        if (existing) {
          if (aiCluster.title) existing.title = aiCluster.title;
          if (aiCluster.explanation) existing.explanation = aiCluster.explanation;
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [report, activeSheet]);

  if (!report || clusters.length === 0) return null;

  return (
    <div className="px-4 pt-3">
      <div className="rounded-2xl border border-stone-900/10 bg-white/70 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
              <Layers className="h-4 w-4 text-brand-600" />
            </span>
            <div>
              <h3 className="text-xs font-bold text-stone-900">
                Groupement par Motifs & Grappes d'anomalies
              </h3>
              <p className="text-[11px] text-stone-500">
                Auditez en masse : chaque grappe réunit les lignes partageant la même cause racine.
              </p>
            </div>
          </div>

          {activeClusterId && (
            <button
              type="button"
              onClick={() => setActiveClusterId(null)}
              className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-1 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
            >
              <X className="h-3 w-3" />
              <span>Voir toutes les lignes</span>
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((cluster) => {
            const isActive = activeClusterId === cluster.id;
            return (
              <button
                key={cluster.id}
                type="button"
                onClick={() => setActiveClusterId(isActive ? null : cluster.id)}
                className={cn(
                  "flex flex-col justify-between rounded-xl border p-3 text-left transition-all",
                  isActive
                    ? "border-stone-900 bg-stone-900 text-white shadow-sm ring-1 ring-stone-900"
                    : "border-stone-900/10 bg-[#FCFBF8] text-stone-800 hover:border-stone-900/25 hover:bg-white"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        cluster.severity === "blocking"
                          ? isActive
                            ? "bg-severe-500/30 text-severe-200"
                            : "bg-severe-50 text-severe-700 ring-1 ring-inset ring-severe-600/20"
                          : isActive
                            ? "bg-amber-500/30 text-amber-200"
                            : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/25"
                      )}
                    >
                      {cluster.rule} · {cluster.severity === "blocking" ? "Bloquant" : "Avertissement"}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-xs font-bold",
                        isActive ? "text-white" : "text-stone-900"
                      )}
                    >
                      {cluster.count} {cluster.count > 1 ? "lignes" : "ligne"}
                    </span>
                  </div>

                  <h4
                    className={cn(
                      "mt-2 text-xs font-bold",
                      isActive ? "text-white" : "text-stone-900"
                    )}
                  >
                    {cluster.title}
                  </h4>
                  <p
                    className={cn(
                      "mt-1 text-[11px] leading-relaxed line-clamp-2",
                      isActive ? "text-stone-300" : "text-stone-500"
                    )}
                  >
                    {cluster.explanation}
                  </p>
                </div>

                <div
                  className={cn(
                    "mt-3 flex items-center justify-between border-t pt-2 text-[10.5px] font-medium",
                    isActive
                      ? "border-stone-800 text-stone-300"
                      : "border-stone-100 text-stone-500"
                  )}
                >
                  <span>{isActive ? "Filtre actif" : "Cliquer pour isoler"}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
