"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import {
  BarChart3,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Filter,
  XCircle,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/cn";

export default function AuditTelemetry() {
  const {
    report,
    activeSheet,
    selectedColumnFilter,
    setSelectedColumnFilter,
    userAuditStatus,
  } = useStore();

  const activeIssues = useMemo(() => {
    if (!report) return [];
    return report.issues.filter((i) => !activeSheet || i.sheet === activeSheet);
  }, [report, activeSheet]);

  // Total lines on active sheet
  const activeSheetRows = useMemo(() => {
    if (!report) return [];
    return report.rows.filter((r) => !activeSheet || r.sheet === activeSheet);
  }, [report, activeSheet]);

  // Column Pareto: frequency of issues per column + top reason
  const columnPareto = useMemo(() => {
    const counts: Record<
      string,
      { blocking: number; warning: number; total: number; reasons: Record<string, { count: number; rule: string }> }
    > = {};
    activeIssues.forEach((issue) => {
      const col = issue.field || "Général";
      if (!counts[col]) counts[col] = { blocking: 0, warning: 0, total: 0, reasons: {} };
      if (issue.severity === "blocking") counts[col].blocking++;
      else counts[col].warning++;
      counts[col].total++;
      const key = `${issue.rule} · ${issue.message}`;
      if (!counts[col].reasons[key]) counts[col].reasons[key] = { count: 0, rule: issue.rule };
      counts[col].reasons[key].count++;
    });
    return Object.entries(counts)
      .map(([col, stats]) => {
        const top = Object.entries(stats.reasons).sort((a, b) => b[1].count - a[1].count)[0];
        return [col, { ...stats, topReason: top?.[0] ?? "", topRule: top?.[1].rule ?? "" }] as const;
      })
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
  }, [activeIssues]);

  const maxColumnErrors = columnPareto[0]?.[1].total ?? 1;

  if (!report || activeSheetRows.length === 0) return null;

  const totalRows = activeSheetRows.length;
  const blockingCount = activeIssues.filter((i) => i.severity === "blocking").length;
  const warningCount = activeIssues.filter((i) => i.severity !== "blocking").length;
  const rowsWithIssues = new Set(activeIssues.map((i) => i.rowId)).size;
  const healthyRows = Math.max(0, totalRows - rowsWithIssues);
  const complianceRate = Math.round((healthyRows / totalRows) * 100);

  // Human sign-off telemetry
  const auditedCount = Object.keys(userAuditStatus).length;
  const toleratedCount = Object.values(userAuditStatus).filter((s) => s === "tolerated").length;
  const flaggedCount = Object.values(userAuditStatus).filter((s) => s === "flagged").length;

  return (
    <div className="px-4 pt-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Card 1: Cockpit Risk Gauge */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/70 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/20">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="text-xs font-bold text-stone-800">
                Télémétrie Simulation Cockpit
              </span>
            </div>
            <span className="font-mono text-sm font-bold text-stone-900">
              {complianceRate}%
            </span>
          </div>

          <div className="mt-3">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-stone-100 ring-1 ring-inset ring-stone-900/5">
              <div
                style={{ width: `${(healthyRows / totalRows) * 100}%` }}
                className="bg-brand-500 transition-all duration-500"
                title={`${healthyRows} lignes saines`}
              />
              <div
                style={{ width: `${(warningCount / totalRows) * 100}%` }}
                className="bg-amber-500 transition-all duration-500"
                title={`${warningCount} avertissements`}
              />
              <div
                style={{ width: `${(blockingCount / totalRows) * 100}%` }}
                className="bg-severe-500 transition-all duration-500"
                title={`${blockingCount} bloquants`}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-stone-600">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              <span>Saines : <strong className="text-stone-900">{healthyRows}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-stone-600">
              <span className="h-2 w-2 rounded-full bg-severe-500" />
              <span>Bloquants : <strong className="text-severe-700">{blockingCount}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-stone-600">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Avert. : <strong className="text-amber-800">{warningCount}</strong></span>
            </div>
          </div>
        </div>

        {/* Card 2: Interactive Column Pareto Impact */}
        <div className="rounded-2xl border border-stone-900/10 bg-white/70 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-100 text-stone-700">
                <BarChart3 className="h-4 w-4" />
              </span>
              <div>
                <span className="text-xs font-bold text-stone-800">
                  Colonnes à fort impact (Top rejets)
                </span>
                <span className="ml-2 text-[10.5px] text-stone-400">
                  Cliquez sur une colonne pour filtrer le tableau
                </span>
              </div>
            </div>

            {selectedColumnFilter && (
              <button
                type="button"
                onClick={() => setSelectedColumnFilter(null)}
                className="flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[10.5px] font-medium text-stone-600 hover:bg-stone-200"
              >
                <XCircle className="h-3 w-3" />
                <span>Effacer filtre ({selectedColumnFilter})</span>
              </button>
            )}
          </div>

          {columnPareto.length === 0 ? (
            <p className="mt-4 text-center text-xs text-stone-400">
              Aucune anomalie détectée sur cette feuille. Toutes les colonnes sont conformes.
            </p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-xl border border-stone-900/10">
              <table className="w-full table-fixed text-left text-xs">
                <thead>
                  <tr className="bg-brand-50/60 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                    <th className="w-[30%] px-3 py-2 font-semibold">Colonne</th>
                    <th className="px-3 py-2 font-semibold">Raison principale</th>
                    <th className="w-[132px] px-3 py-2 text-right font-semibold">Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {columnPareto.map(([col, stats]) => {
                    const isSelected = selectedColumnFilter === col;
                    const percent = Math.round((stats.total / maxColumnErrors) * 100);
                    return (
                      <tr
                        key={col}
                        onClick={() => setSelectedColumnFilter(isSelected ? null : col)}
                        title={stats.topReason || col}
                        className={cn(
                          "cursor-pointer border-t border-stone-100 transition-colors",
                          isSelected ? "bg-brand-600 text-white" : "hover:bg-brand-50/60"
                        )}
                      >
                        <td className="px-3 py-2 align-top">
                          <span className="block break-words font-mono text-[11.5px] font-medium leading-snug">
                            {col}
                          </span>
                          <span
                            className={cn(
                              "mt-0.5 block text-[10.5px]",
                              isSelected ? "text-white/70" : "text-stone-400"
                            )}
                          >
                            {stats.blocking > 0 ? `${stats.blocking} bloq.` : "0 bloq."} · {stats.warning} avert.
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {stats.topReason ? (
                            <span
                              className={cn(
                                "block break-words text-[11.5px] leading-snug",
                                isSelected ? "text-white/90" : "text-stone-600"
                              )}
                            >
                              {stats.topReason}
                            </span>
                          ) : (
                            <span className={isSelected ? "text-white/70" : "text-stone-400"}>—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={cn(
                              "block text-right font-mono text-[11px]",
                              isSelected ? "text-white/90" : "text-stone-500"
                            )}
                          >
                            {stats.total} err.
                          </span>
                          <span className="mt-1 block">
                            <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                              <span
                                style={{ width: `${percent}%` }}
                                className={cn(
                                  "transition-all duration-300",
                                  stats.blocking > 0 ? "bg-severe-500" : "bg-amber-500"
                                )}
                              />
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
