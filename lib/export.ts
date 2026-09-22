import type { QualityReport } from "@/types/quality";
import { RULE_LABEL } from "@/types/quality";

export function downloadCsv(filename: string, headers: string[], lines: string[][]) {
  const esc = (v: string) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv =
    headers.map(esc).join(";") +
    "\n" +
    lines.map((l) => l.map(esc).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const safe = (s: string) => s.replace(/[^\wÀ-ÖØ-öø-ÿ-]+/g, "_");

export function exportClean(report: QualityReport) {
  const bad = new Set(report.issues.map((i) => i.rowId));
  for (const sheet of report.sheets) {
    const clean = report.rows.filter((r) => r.sheet === sheet.name && !bad.has(r.id));
    downloadCsv(
      `${safe(sheet.name)}_clean.csv`,
      sheet.headers,
      clean.map((r) => sheet.headers.map((h) => r.cells[h] ?? ""))
    );
  }
}

export function exportErrors(report: QualityReport) {
  downloadCsv(
    "journal_erreurs.csv",
    ["Feuille", "Ligne", "Règle", "Détail", "Sévérité", "Champ", "Message", "Correction"],
    report.issues.map((i) => [
      i.sheet,
      String(i.lineNo),
      `${i.rule} — ${RULE_LABEL[i.rule]}`,
      i.type,
      i.severity === "blocking" ? "bloquant" : "avertissement",
      i.field,
      i.message,
      i.suggestion,
    ])
  );
}
