"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  FileSpreadsheet,
  Key,
  Columns,
  Table,
  Layers,
  Sparkles,
  ArrowRight,
  X,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/cn";

export default function DetectionBreakdown() {
  const {
    pendingDetection,
    updateSheetHeaderRow,
    updateSheetKey,
    toggleMandatoryColumn,
    confirmDetection,
    cancelDetection,
    loading,
  } = useStore();

  const [activeSheetName, setActiveSheetName] = useState<string | null>(null);

  if (!pendingDetection) return null;

  const { fileName, sheets, links, rawGrids } = pendingDetection;
  const usableSheets = sheets.filter((s) => !s.ignored);

  // Active sheet fallback
  const currentSheet =
    usableSheets.find((s) => s.name === activeSheetName) ?? usableSheets[0];

  if (!currentSheet) return null;

  const currentGrid = rawGrids[currentSheet.name] ?? [];
  const maxRowInspect = Math.min(25, currentGrid.length);
  const rowOptions = Array.from({ length: maxRowInspect }, (_, i) => {
    const row = currentGrid[i] ?? [];
    const nonBlank = row.filter((c) => (c ?? "").trim() !== "");
    const preview = nonBlank.slice(0, 3).map((c) => c.split("\n")[0].trim()).join(", ");
    return {
      index: i,
      label: `Ligne ${i + 1}${preview ? ` : ${preview.slice(0, 45)}${preview.length > 45 ? "..." : ""}` : " (Vide)"}`,
    };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-3 backdrop-blur-sm md:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-stone-900/15 bg-[#FCFBF8] shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-900/10 bg-white/80 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-stone-900">
                  Détection de la structure Excel
                </h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">
                  Étape 1/2
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Fichier : <span className="font-mono font-medium text-stone-700">{fileName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelDetection}
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            title="Annuler"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Guidance Banner */}
        <div className="border-b border-stone-900/10 bg-brand-50/50 px-6 py-2.5">
          <div className="flex items-start gap-2.5 text-xs text-stone-700">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p>
              <strong className="font-semibold text-stone-900">Détection automatique prête :</strong> Les en-têtes, la clé unique et les colonnes obligatoires ont été identifiés. Vous pouvez valider directement ou ajuster les réglages ci-dessous.
            </p>
          </div>
        </div>

        {/* Sheet Tabs if multi-sheet */}
        {usableSheets.length > 1 && (
          <div className="flex items-center gap-2 border-b border-stone-900/10 bg-stone-100/60 px-6 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
              Feuilles :
            </span>
            <div className="flex flex-wrap gap-1.5">
              {usableSheets.map((sh) => (
                <button
                  key={sh.name}
                  type="button"
                  onClick={() => setActiveSheetName(sh.name)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    currentSheet.name === sh.name
                      ? "bg-stone-900 text-white shadow-sm"
                      : "text-stone-600 hover:bg-white hover:text-stone-900"
                  )}
                >
                  <Table className="h-3.5 w-3.5" />
                  <span>{sh.name}</span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      currentSheet.name === sh.name
                        ? "bg-stone-800 text-stone-300"
                        : "bg-stone-200/70 text-stone-600"
                    )}
                  >
                    {sh.rows.length} lignes
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Modal Body (Scrollable) */}
        <div className="slim-scroll flex-1 overflow-y-auto p-6 space-y-6">
          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* Control 1: Header Row Selector */}
            <div className="rounded-xl border border-stone-900/10 bg-white/70 p-4 transition-colors hover:border-stone-900/20">
              <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-stone-800">
                  <Columns className="h-4 w-4 text-brand-600" />
                  <span>Ligne d'en-tête (Noms des colonnes)</span>
                </label>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 ring-1 ring-inset ring-stone-900/10">
                  Excel Ligne {currentSheet.headerRowIndex + 1}
                </span>
              </div>
              <p className="mb-3 text-[11.5px] leading-relaxed text-stone-500">
                La ligne qui contient les titres de colonnes métier (ex. <em>Controlling area, Profit center</em>).
              </p>
              <select
                value={currentSheet.headerRowIndex}
                onChange={(e) =>
                  updateSheetHeaderRow(currentSheet.name, parseInt(e.target.value, 10))
                }
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-800 shadow-2xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {rowOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {currentSheet.skipped > 0 && (
                <p className="mt-2 text-[11px] text-stone-400">
                  {currentSheet.skipped} ligne(s) technique(s) ou de formats SAP ignorées automatiquement.
                </p>
              )}
            </div>

            {/* Control 2: Key Identifier Column */}
            <div className="rounded-xl border border-stone-900/10 bg-white/70 p-4 transition-colors hover:border-stone-900/20">
              <div className="mb-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-bold text-stone-800">
                  <Key className="h-4 w-4 text-amber-600" />
                  <span>Identifiant unique (Colonne Clé)</span>
                </label>
                {currentSheet.keyColumnIndex !== null ? (
                  <span className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">
                    <CheckCircle2 className="h-3 w-3" />
                    Détecté
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/25">
                    <AlertTriangle className="h-3 w-3" />
                    Aucune clé
                  </span>
                )}
              </div>
              <p className="mb-3 text-[11.5px] leading-relaxed text-stone-500">
                La colonne qui identifie chaque ligne. Utilisée pour repérer les doublons (R3) et lier les tables (R2).
              </p>
              <select
                value={currentSheet.keyColumnIndex ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  updateSheetKey(currentSheet.name, val === "" ? null : parseInt(val, 10));
                }}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-800 shadow-2xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">(Aucune clé spécifique sélectionnée)</option>
                {currentSheet.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h} {currentSheet.mandatoryIndexes.includes(i) ? "(*)" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-[11px] text-stone-400">
                {currentSheet.keyColumnIndex !== null
                  ? `Clé active : « ${currentSheet.headers[currentSheet.keyColumnIndex]} »`
                  : "Sans clé, le contrôle des doublons ne s'appliquera pas."}
              </p>
            </div>
          </div>

          {/* Section 3: Mandatory Columns Toggle (Severe plum palette) */}
          <div className="rounded-xl border border-stone-900/10 bg-white/70 p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-bold text-stone-800">
                <CheckCircle2 className="h-4 w-4 text-severe-500" />
                <span>Colonnes obligatoires (Règle R1 : aucune case vide autorisée)</span>
              </label>
              <span className="rounded-full bg-severe-50 px-2 py-0.5 text-[10.5px] font-semibold text-severe-700 ring-1 ring-inset ring-severe-600/20">
                {currentSheet.mandatoryIndexes.length} obligatoire(s)
              </span>
            </div>
            <p className="mb-3 text-[11.5px] leading-relaxed text-stone-500">
              Cliquez sur une colonne pour l'activer ou la désactiver comme obligatoire. Celles marquées d'une astérisque (*) dans Excel sont sélectionnées par défaut.
            </p>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto slim-scroll p-1">
              {currentSheet.headers.map((h, i) => {
                const isMandatory = currentSheet.mandatoryIndexes.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleMandatoryColumn(currentSheet.name, i)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
                      isMandatory
                        ? "border-severe-500/30 bg-severe-50 text-severe-700 shadow-2xs ring-1 ring-inset ring-severe-600/20 hover:bg-severe-100"
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isMandatory ? "bg-severe-500" : "bg-stone-300"
                      )}
                    />
                    <span>{h}</span>
                    {isMandatory && <span className="font-bold text-severe-600">*</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Sheet Link Relationships if detected */}
          {links.length > 0 && (
            <div className="rounded-xl border border-stone-900/10 bg-stone-50/70 p-4">
              <div className="mb-1 flex items-center gap-2 text-xs font-bold text-stone-800">
                <Layers className="h-4 w-4 text-brand-600" />
                <span>Relation inter-feuilles détectée (Contrôle R2)</span>
              </div>
              <p className="mb-2 text-[11.5px] text-stone-500">
                Le système a repéré un lien de clé entre deux feuilles pour vérifier l'existence des données :
              </p>
              <div className="space-y-1.5">
                {links.map((link, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-900/10 bg-white px-3 py-2 text-xs font-medium text-stone-800 shadow-2xs"
                  >
                    <span className="font-semibold text-stone-900">{link.childSheet}</span>
                    <ArrowRight className="h-3 w-3 text-stone-400" />
                    <span className="font-semibold text-stone-900">{link.parentSheet}</span>
                    <span className="text-stone-400">via</span>
                    <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-700">
                      colonne #{link.childKeyIndex + 1} ({Math.round(link.overlap * 100)}% de correspondance)
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Live Mini Data Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                <Table className="h-3.5 w-3.5 text-stone-500" />
                <span>Aperçu instantané des données ({Math.min(3, currentSheet.rows.length)} premières lignes)</span>
              </h4>
              <span className="text-[11px] text-stone-400">
                Total : {currentSheet.rows.length} lignes de données réelles
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-stone-900/10 bg-white">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-stone-900/10 bg-stone-100/70 text-stone-700">
                    <th className="px-3 py-2 font-mono text-[10.5px] font-semibold text-stone-400">
                      Ligne Excel
                    </th>
                    {currentSheet.headers.map((h, i) => (
                      <th
                        key={i}
                        className={cn(
                          "whitespace-nowrap px-3 py-2 font-semibold",
                          currentSheet.keyColumnIndex === i && "bg-amber-50/70 text-amber-900",
                          currentSheet.mandatoryIndexes.includes(i) && "text-severe-700"
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <span>{h}</span>
                          {currentSheet.mandatoryIndexes.includes(i) && (
                            <span className="text-severe-600 font-bold">*</span>
                          )}
                          {currentSheet.keyColumnIndex === i && (
                            <Key className="h-3 w-3 text-amber-600" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {currentSheet.rows.slice(0, 3).map((r, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-stone-50/80">
                      <td className="px-3 py-1.5 font-mono text-[10.5px] text-stone-400">
                        {currentSheet.lineNos[rowIdx] ?? currentSheet.startLineNo + rowIdx}
                      </td>
                      {currentSheet.headers.map((_, colIdx) => (
                        <td
                          key={colIdx}
                          className="max-w-[200px] truncate whitespace-nowrap px-3 py-1.5 text-stone-600"
                        >
                          {r[colIdx] || <span className="text-stone-300 italic">vide</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-900/10 bg-stone-50/70 px-6 py-4">
          <button
            type="button"
            onClick={cancelDetection}
            disabled={loading}
            className="rounded-lg border border-stone-900/10 bg-white px-4 py-2 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-100 hover:text-stone-900"
          >
            Annuler et changer de fichier
          </button>

          <button
            type="button"
            onClick={confirmDetection}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-stone-900 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98]"
          >
            {loading ? (
              <span>Calcul de l'audit...</span>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-brand-100" />
                <span>Valider et lancer l'audit qualité</span>
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
