"use client";

import { useMemo } from "react";
import { X, Check, Flag, RotateCcw, AlertTriangle, ShieldCheck, Copy, Sparkles } from "lucide-react";
import { mid, useStore, UserAuditDecision } from "@/lib/store";
import { RULE_LABEL } from "@/types/quality";
import { cn } from "@/lib/cn";

export default function RowDrawer() {
  const {
    report,
    selectedRowId,
    setSelectedRowId,
    pushMessage,
    userAuditStatus,
    setUserAuditStatus,
  } = useStore();

  const row = report?.rows.find((r) => r.id === selectedRowId) ?? null;
  const issues = report?.issues.filter((i) => i.rowId === selectedRowId) ?? [];
  const sheet = report?.sheets.find((s) => s.name === row?.sheet);

  // If R3 duplicate, find sibling rows sharing the same key
  const duplicateSiblings = useMemo(() => {
    if (!report || !row || !row.key) return [];
    const hasR3 = issues.some((i) => i.rule === "R3");
    if (!hasR3) return [];
    return report.rows.filter(
      (r) => r.sheet === row.sheet && r.key === row.key && r.id !== row.id
    );
  }, [report, row, issues]);

  if (!row || !report) return null;
  const cells = sheet ? sheet.headers.map((h) => [h, row.cells[h] ?? ""] as const) : [];
  const labelOf = (h: string) =>
    (sheet && sheet.labels[sheet.headers.indexOf(h)]) || h;

  const currentStatus = userAuditStatus[row.id];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-stone-950/30 backdrop-blur-xs"
        onClick={() => setSelectedRowId(null)}
      />
      <aside className="relative flex h-full w-full max-w-[480px] flex-col bg-[#FCFBF8] shadow-2xl border-l border-stone-900/10">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                {row.sheet} · Ligne {row.lineNo}
              </span>
              {currentStatus && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.2 text-[10px] font-semibold",
                    currentStatus === "tolerated" && "bg-stone-200 text-stone-700",
                    currentStatus === "flagged" && "bg-amber-100 text-amber-800",
                    currentStatus === "verified" && "bg-brand-100 text-brand-700"
                  )}
                >
                  {currentStatus === "tolerated" && "Toléré"}
                  {currentStatus === "flagged" && "Signalé"}
                  {currentStatus === "verified" && "Vérifié"}
                </span>
              )}
            </div>
            <h2 className="mt-0.5 truncate font-mono text-[16px] font-bold text-stone-900">
              {row.key || "Clé vide"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setSelectedRowId(null)}
            aria-label="Fermer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="slim-scroll flex-1 space-y-4 overflow-y-auto p-5">
          {/* Section: Human Sign-off Buttons */}
          <div className="rounded-xl border border-stone-900/10 bg-white p-3 shadow-2xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
              Décision d'audit sur cette ligne :
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setUserAuditStatus(row.id, currentStatus === "tolerated" ? null : "tolerated")
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                  currentStatus === "tolerated"
                    ? "border-stone-900 bg-stone-900 text-white shadow-xs"
                    : "border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                )}
              >
                <Check className="h-3.5 w-3.5" />
                <span>{currentStatus === "tolerated" ? "Toléré (Actif)" : "Tolérer l'anomalie"}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setUserAuditStatus(row.id, currentStatus === "flagged" ? null : "flagged")
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all",
                  currentStatus === "flagged"
                    ? "border-amber-600 bg-amber-600 text-white shadow-xs"
                    : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                )}
              >
                <Flag className="h-3.5 w-3.5" />
                <span>{currentStatus === "flagged" ? "Signalé (Actif)" : "Signaler au métier"}</span>
              </button>

              {currentStatus && (
                <button
                  type="button"
                  onClick={() => setUserAuditStatus(row.id, null)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:text-stone-700"
                  title="Réinitialiser le statut"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Réinitialiser</span>
                </button>
              )}
            </div>
          </div>

          {/* Section: Diagnostic Flash / Issues */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-stone-900">
                {issues.length === 0
                  ? "Diagnostic : Conforme"
                  : `${issues.length} anomalie${issues.length > 1 ? "s" : ""} détectée${issues.length > 1 ? "s" : ""}`}
              </p>
              {issues.length === 0 && (
                <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">
                  <ShieldCheck className="h-3 w-3" />
                  Prêt Cockpit
                </span>
              )}
            </div>

            {issues.length === 0 ? (
              <p className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-xs text-brand-800">
                Cette ligne respecte l'ensemble des règles de migration SAP S/4HANA.
              </p>
            ) : (
              <div className="space-y-2.5">
                {issues.map((iss, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-stone-200/90 bg-white p-3.5 text-xs shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-stone-900 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-white">
                        {iss.rule}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset",
                          iss.severity === "blocking"
                            ? "bg-severe-50 text-severe-700 ring-severe-600/20"
                            : "bg-amber-50 text-amber-800 ring-amber-600/25"
                        )}
                      >
                        {iss.severity === "blocking" ? "Bloquant Cockpit" : "Avertissement"}
                      </span>
                      <span className="font-bold text-stone-900" title={iss.field}>
                        {labelOf(iss.field)}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-stone-400 font-medium">
                      {RULE_LABEL[iss.rule]}
                    </p>
                    <p className="mt-2 leading-relaxed text-stone-700 font-medium">
                      {iss.message}
                    </p>

                    {iss.related && (
                      <p className="mt-1.5 font-mono text-[11px] text-stone-500 bg-stone-50 px-2 py-1 rounded">
                        Référence liée : {iss.related}
                      </p>
                    )}

                    <div className="mt-2.5 rounded-lg border border-brand-500/20 bg-brand-50/50 p-2.5 text-stone-800">
                      <span className="font-bold text-brand-700">Action recommandée : </span>
                      <span className="text-[11.5px]">{iss.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Sibling duplicates comparison if R3 */}
          {duplicateSiblings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 mb-2">
                <Copy className="h-4 w-4 text-amber-600" />
                <span>Lignes sœurs en doublon sur cette clé ({duplicateSiblings.length})</span>
              </div>
              <p className="text-[11px] text-amber-800 mb-2">
                Ces autres lignes partagent exactement la même clé « {row.key} » :
              </p>
              <div className="space-y-1.5">
                {duplicateSiblings.map((sib) => (
                  <div
                    key={sib.id}
                    onClick={() => setSelectedRowId(sib.id)}
                    className="flex items-center justify-between rounded-lg bg-white p-2 text-xs border border-amber-200/60 cursor-pointer hover:bg-amber-100/50 transition-colors"
                  >
                    <span className="font-mono text-stone-600">Ligne Excel #{sib.lineNo}</span>
                    <span className="text-[11px] font-semibold text-amber-800">Inspecter ➜</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: All Cells of the Row */}
          <div>
            <p className="text-xs font-bold text-stone-900 mb-2">
              Détail de toutes les colonnes ({cells.length})
            </p>
            <div className="space-y-1">
              {cells.map(([h, v]) => {
                const isFaulty = issues.some((iss) => iss.field === h);
                const isKey = h === sheet?.keyColumn;

                return (
                  <div
                    key={h}
                    className={cn(
                      "flex items-baseline justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
                      isFaulty
                        ? "border-severe-200 bg-severe-50 text-severe-800 font-medium"
                        : "border-stone-200/70 bg-white text-stone-700"
                    )}
                  >
                    <span className="shrink-0 font-medium text-stone-500" title={h}>
                      {labelOf(h)} {isKey && "🔑"}
                    </span>
                    <span
                      className={cn(
                        "truncate font-mono text-[11.5px]",
                        isFaulty ? "font-bold text-severe-800" : isKey ? "font-bold text-stone-900" : "text-stone-800"
                      )}
                    >
                      {v || (
                        <span className={cn(isFaulty ? "text-severe-600 italic font-semibold" : "text-stone-300 font-sans")}>
                          {isFaulty ? "(vide - obligatoire)" : "—"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-stone-200 bg-white p-4">
          <button
            type="button"
            onClick={() => {
              pushMessage({
                id: mid(),
                role: "agent",
                text:
                  issues.length === 0
                    ? `Ligne ${row.lineNo} (${row.key || "clé vide"}) : statut conforme pour Cockpit.`
                    : `Audit Ligne ${row.lineNo} (${row.key || "clé vide"}) : ${issues.map((x) => `[${x.rule}] ${x.suggestion}`).join(" ")}`,
              });
              setSelectedRowId(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-2.5 text-xs font-semibold text-white hover:bg-black transition-all"
          >
            <Sparkles className="h-4 w-4 text-brand-200" />
            <span>Expliquer dans le chat avec l'agent</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
