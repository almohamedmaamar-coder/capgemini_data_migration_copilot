"use client";

import { useMemo, useEffect } from "react";
import {
  KeyRound,
  Search,
  SearchX,
  Table2,
  AlertOctagon,
  ArrowDown,
  ArrowUp,
  Filter,
  CheckCircle2,
  X,
  Flag,
  Check,
  ShieldAlert,
} from "lucide-react";
import type { Filter as IssueFilter } from "@/lib/store";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/cn";
import type { IssueType, RuleCode } from "@/types/quality";

const TABS: { id: IssueFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "mandatory", label: "R1 · Obligatoires" },
  { id: "consistency", label: "R2 · Cohérence" },
  { id: "duplicate", label: "R3 · Doublons" },
];

const TABLE_SCROLL_H = "max-h-[720px]";

function RuleBadge({ rule, severity }: { rule: RuleCode; severity: string }) {
  const tone =
    severity === "blocking"
      ? "bg-severe-50 text-severe-700 ring-severe-600/20"
      : "bg-amber-50 text-amber-700 ring-amber-600/25";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        tone
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          severity === "blocking" ? "bg-severe-500" : "bg-amber-500"
        )}
      />
      {rule}
    </span>
  );
}

function matchesTab(type: IssueType, filter: IssueFilter): boolean {
  if (filter === "all") return true;
  if (filter === "mandatory") return type === "mandatory" || type === "missing";
  return type === filter;
}

export default function DataTable() {
  const {
    report,
    filter,
    setFilter,
    query,
    setQuery,
    activeSheet,
    setActiveSheet,
    setSelectedRowId,
    selectedRowId,
    focusOnlyIssues,
    toggleFocusOnlyIssues,
    selectedColumnFilter,
    setSelectedColumnFilter,
    activeClusterId,
    setActiveClusterId,
    userAuditStatus,
    jumpToNextIssue,
    jumpToPrevIssue,
  } = useStore();

  // Keyboard navigation shortcuts: J for next issue, K for prev issue
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        jumpToNextIssue();
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        jumpToPrevIssue();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jumpToNextIssue, jumpToPrevIssue]);

  const sheet = useMemo(
    () => report?.sheets.find((s) => s.name === activeSheet) ?? report?.sheets[0] ?? null,
    [report, activeSheet]
  );

  const columns = useMemo(() => {
    if (!sheet) return [];
    return sheet.headers;
  }, [sheet]);

  // Map of rowId -> array of issues
  const issuesByRow = useMemo(() => {
    const m = new Map<string, { rule: RuleCode; severity: string; type: IssueType; column?: string; message: string }[]>();
    report?.issues.forEach((i) => {
      if (sheet && i.sheet !== sheet.name) return;
      const arr = m.get(i.rowId) ?? [];
      arr.push({ rule: i.rule, severity: i.severity, type: i.type, column: i.field, message: i.message });
      m.set(i.rowId, arr);
    });
    return m;
  }, [report, sheet]);

  // Set of issue rowIds on active sheet
  const issueRowIds = useMemo(() => {
    if (!report || !sheet) return [];
    return Array.from(
      new Set(
        report.issues.filter((i) => i.sheet === sheet.name).map((i) => i.rowId)
      )
    );
  }, [report, sheet]);

  // Current issue position for counter
  const currentIssueIndex = selectedRowId ? issueRowIds.indexOf(selectedRowId) : -1;

  // Map of rowId -> set of faulty column names
  const faultyCellsByRow = useMemo(() => {
    const m = new Map<string, Set<string>>();
    report?.issues.forEach((i) => {
      if (sheet && i.sheet !== sheet.name) return;
      if (i.field) {
        const s = m.get(i.rowId) ?? new Set<string>();
        s.add(i.field);
        m.set(i.rowId, s);
      }
    });
    return m;
  }, [report, sheet]);

  // Filtered dataset
  const filtered = useMemo(() => {
    if (!report || !sheet) return [];
    const q = query.trim().toLowerCase();

    return report.rows.filter((r) => {
      if (r.sheet !== sheet.name) return false;
      const iss = issuesByRow.get(r.id) ?? [];

      // Mode "Uniquement anomalies"
      if (focusOnlyIssues && iss.length === 0) return false;

      // Filter by Tab (R1, R2, R3, all)
      if (filter !== "all" && !iss.some((x) => matchesTab(x.type, filter))) return false;

      // Filter by selected column from Pareto chart
      if (selectedColumnFilter && !iss.some((x) => x.column === selectedColumnFilter)) {
        return false;
      }

      // Filter by cluster pattern
      if (activeClusterId) {
        if (activeClusterId.startsWith("r1_")) {
          const targetCol = activeClusterId.replace("r1_", "");
          if (!iss.some((x) => x.rule === "R1" && x.column === targetCol)) return false;
        } else if (activeClusterId === "r2_consistency") {
          if (!iss.some((x) => x.rule === "R2")) return false;
        } else if (activeClusterId === "r3_duplicate") {
          if (!iss.some((x) => x.rule === "R3")) return false;
        }
      }

      // Search query
      if (!q) return true;
      return Object.values(r.cells).join(" ").toLowerCase().includes(q);
    });
  }, [report, sheet, filter, query, issuesByRow, focusOnlyIssues, selectedColumnFilter, activeClusterId]);

  if (!report || !sheet) return null;

  const labelOf = (h: string) => sheet.labels?.[sheet.headers.indexOf(h)] ?? h;
  const visible = filtered;

  return (
    <div className="px-4 pb-6 pt-3">
      <div className="overflow-hidden rounded-2xl border border-stone-900/10 bg-white shadow-[0_1px_2px_rgba(28,25,23,0.05),0_8px_24px_-16px_rgba(28,25,23,0.12)]">
        {/* Onglets feuilles */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-stone-900/10 bg-[#FCFBF8] px-3 py-2">
          <Table2 size={13} className="shrink-0 text-stone-400" />
          {report.sheets.map((s) => {
            const count = report.rows.filter((r) => r.sheet === s.name).length;
            const active = s.name === sheet.name;
            return (
              <button
                key={s.name}
                type="button"
                onClick={() => {
                  setActiveSheet(s.name);
                }}
                className={cn(
                  "shrink-0 rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-brand-600 text-white"
                    : "text-stone-500 hover:bg-brand-50 hover:text-brand-700"
                )}
              >
                {s.name}
                <span
                  className={cn(
                    "tnum ml-1.5 font-mono text-[11px]",
                    active ? "text-white/60" : "text-stone-400"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          {sheet.keyColumn && (
            <span className="ml-auto hidden shrink-0 font-mono text-[11px] text-stone-400 sm:inline">
              clé : {sheet.keyColumn}
            </span>
          )}
        </div>

        {/* Triage & High-Speed Navigation Bar (for 10,000 rows) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/70 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Focus Switch */}
            <button
              type="button"
              onClick={toggleFocusOnlyIssues}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-all",
                focusOnlyIssues
                  ? "border-severe-500/40 bg-severe-50 text-severe-700 shadow-2xs ring-1 ring-severe-600/20"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300"
              )}
            >
              <AlertOctagon className={cn("h-3.5 w-3.5", focusOnlyIssues ? "text-severe-600" : "text-stone-400")} />
              <span>{focusOnlyIssues ? "Focus anomalies actif" : "Masquer les lignes saines"}</span>
              <span className="ml-1 rounded-full bg-stone-200/70 px-1.5 py-0.2 text-[10px] text-stone-700">
                {issueRowIds.length}
              </span>
            </button>

            {/* Active filters indicators */}
            {selectedColumnFilter && (
              <span className="flex items-center gap-1 rounded-md bg-stone-900 px-2 py-1 text-xs font-medium text-white shadow-2xs">
                <span>Col: {selectedColumnFilter}</span>
                <button
                  type="button"
                  onClick={() => setSelectedColumnFilter(null)}
                  className="hover:text-stone-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}

            {activeClusterId && (
              <span className="flex items-center gap-1 rounded-md bg-stone-900 px-2 py-1 text-xs font-medium text-white shadow-2xs">
                <span>Grappe active</span>
                <button
                  type="button"
                  onClick={() => setActiveClusterId(null)}
                  className="hover:text-stone-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>

          {/* Jump to Next/Prev Issue buttons */}
          {issueRowIds.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="hidden font-mono text-[11px] text-stone-400 sm:inline">
                {currentIssueIndex >= 0
                  ? `Anomalie ${currentIssueIndex + 1} / ${issueRowIds.length}`
                  : `${issueRowIds.length} anomalies`}
              </span>
              <button
                type="button"
                onClick={jumpToPrevIssue}
                className="flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 shadow-2xs hover:bg-stone-100"
                title="Raccourci clavier : touche K"
              >
                <ArrowUp className="h-3 w-3 text-stone-400" />
                <span className="hidden sm:inline">Précédente (K)</span>
              </button>
              <button
                type="button"
                onClick={jumpToNextIssue}
                className="flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 shadow-2xs hover:bg-stone-100"
                title="Raccourci clavier : touche J"
              >
                <ArrowDown className="h-3 w-3 text-stone-400" />
                <span className="hidden sm:inline">Suivante (J)</span>
              </button>
            </div>
          )}
        </div>

        {/* Filtres de règles + recherche */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <div className="slim-scroll flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setFilter(t.id);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  filter === t.id
                    ? "bg-brand-600 text-white"
                    : "text-stone-500 hover:bg-brand-50 hover:text-brand-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 rounded-full border border-transparent bg-stone-100/80 py-1.5 pl-3 pr-3 transition-colors focus-within:border-stone-300 focus-within:bg-white">
            <Search size={14} className="shrink-0 text-stone-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Rechercher…"
              className="w-44 bg-transparent text-[13px] text-stone-900 outline-none placeholder:text-stone-400"
            />
          </div>
        </div>

        {/* Tableau avec Cell X-Ray in-place — ~15 lignes visibles, scroll vertical */}
        <div className={cn("slim-scroll overflow-auto border-t border-stone-100", TABLE_SCROLL_H)}>
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur">
              <tr className="border-b border-stone-900/10 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-stone-400">
                <th className="w-14 px-4 py-2.5 font-semibold">#</th>
                {columns.map((c) => (
                  <th
                    key={c}
                    className={cn(
                      "max-w-[220px] truncate px-2.5 py-2.5 font-semibold",
                      c === sheet.keyColumn && "text-stone-900",
                      selectedColumnFilter === c && "bg-stone-100 text-stone-900"
                    )}
                  >
                    <span className="inline-flex max-w-full items-center gap-1" title={labelOf(c)}>
                      {c === sheet.keyColumn && (
                        <KeyRound size={10} className="shrink-0 text-brand-600" />
                      )}
                      <span className="truncate">{labelOf(c)}</span>
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-semibold">Statut qualité</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const iss = issuesByRow.get(r.id) ?? [];
                const faultyCols = faultyCellsByRow.get(r.id);
                const auditDecision = userAuditStatus[r.id];
                const isSelected = selectedRowId === r.id;

                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedRowId(r.id)}
                    className={cn(
                      "cursor-pointer border-b border-stone-100 transition-colors last:border-0 hover:bg-stone-50",
                      isSelected && "bg-stone-100/70 hover:bg-stone-100/70 ring-1 ring-inset ring-stone-900/10"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-[11.5px] text-stone-400">
                      {r.lineNo}
                    </td>

                    {/* Colonnes avec Cell X-Ray */}
                    {columns.map((c) => {
                      const isFaulty = faultyCols?.has(c);
                      const isKey = c === sheet.keyColumn;
                      const cellVal = r.cells[c];

                      return (
                        <td
                          key={c}
                          className={cn(
                            "max-w-[220px] truncate whitespace-nowrap px-2.5 py-2 text-[13px] transition-colors",
                            isFaulty && "bg-severe-50/60 font-medium text-severe-800",
                            !isFaulty && isKey && "font-mono text-[12px] font-medium text-stone-900",
                            !isFaulty && !isKey && "text-stone-600"
                          )}
                        >
                          {isFaulty ? (
                            <span className="inline-flex items-center gap-1 rounded bg-severe-50 px-1.5 py-0.5 font-medium text-severe-800 ring-1 ring-inset ring-severe-600/20">
                              <span>{cellVal || "(requis vide)"}</span>
                              <span className="text-[10px] text-severe-600 font-bold">*</span>
                            </span>
                          ) : (
                            cellVal || <span className="text-stone-300">—</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Statut Qualité + Statut d'Arbitrage Humain */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {/* Statut d'arbitrage manuel */}
                        {auditDecision === "tolerated" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-stone-200/80 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                            <Check className="h-3 w-3" />
                            Toléré
                          </span>
                        )}
                        {auditDecision === "flagged" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            <Flag className="h-3 w-3" />
                            Signalé
                          </span>
                        )}
                        {auditDecision === "verified" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Vérifié
                          </span>
                        )}

                        {/* Règles d'audit */}
                        {iss.length === 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-[11.5px] font-medium text-brand-700 ring-1 ring-inset ring-brand-600/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                            valide
                          </span>
                        ) : (
                          [...new Set(iss.map((x) => x.rule))].slice(0, 3).map((rule) => (
                            <RuleBadge
                              key={rule}
                              rule={rule}
                              severity={
                                iss.some((x) => x.rule === rule && x.severity === "blocking")
                                  ? "blocking"
                                  : "warning"
                              }
                            />
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {visible.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-14 text-center">
                    <SearchX size={20} className="mx-auto text-stone-300" />
                    <p className="mt-2 text-[13px] font-medium text-stone-500">
                      Aucune ligne pour ce filtre
                    </p>
                    <p className="mt-0.5 text-[12px] text-stone-400">
                      {focusOnlyIssues
                        ? "Toutes les lignes de cette page sont saines !"
                        : "Essayez « Tous » ou effacez la recherche."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Compteur + hint scroll (remplace la pagination) */}
        <div className="flex items-center justify-between border-t border-stone-100 px-4 py-2.5">
          <span className="font-mono text-[11.5px] text-stone-400">
            {filtered.length} lignes {focusOnlyIssues ? "en anomalie" : ""} · scrollez pour voir la suite
          </span>
        </div>
      </div>
    </div>
  );
}
