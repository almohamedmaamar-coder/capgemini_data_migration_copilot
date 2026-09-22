import { normalizeKey, type SheetLink, type SheetModel } from "@/lib/workbook-detect";
import type {
  DataRow,
  DetectedLink,
  DetectedSheet,
  QualityIssue,
  QualityReport,
} from "@/types/quality";

function isEmpty(v: string): boolean {
  return v.trim() === "";
}

export function analyzeWorkbook(
  sheets: SheetModel[],
  links: SheetLink[],
  fileName: string
): QualityReport {
  const issues: QualityIssue[] = [];
  const rows: DataRow[] = [];
  const rowById = new Map<string, DataRow>();
  const live = sheets.filter((s) => !s.ignored);

  // Index des lignes
  live.forEach((sheet, si) => {
    sheet.rows.forEach((cells, i) => {
      const key =
        sheet.keyColumnIndex !== null ? (cells[sheet.keyColumnIndex] ?? "").trim() : "";
      const row: DataRow = {
        id: `s${si}-r${i}`,
        sheet: sheet.name,
        lineNo: sheet.lineNos[i],
        key,
        cells: Object.fromEntries(sheet.headers.map((h, c) => [h, cells[c] ?? ""])),
      };
      rows.push(row);
      rowById.set(row.id, row);
    });
  });

  const rowsOf = (sheetName: string) => rows.filter((r) => r.sheet === sheetName);
  const modelOf = (sheetName: string) => live.find((s) => s.name === sheetName);

  // ---------- R1 : champs obligatoires ----------
  for (const sheet of live) {
    const required = new Set([...sheet.mandatoryIndexes]);
    if (sheet.keyColumnIndex !== null) required.add(sheet.keyColumnIndex);
    const sheetRows = rowsOf(sheet.name);
    sheetRows.forEach((row, i) => {
      const cells = sheet.rows[i];
      for (const c of required) {
        if (isEmpty(cells[c] ?? "")) {
          const header = sheet.headers[c];
          const isKey = c === sheet.keyColumnIndex;
          issues.push({
            rowId: row.id,
            sheet: sheet.name,
            lineNo: row.lineNo,
            rule: "R1",
            type: isKey ? "missing" : "mandatory",
            severity: "blocking",
            field: header,
            message: isKey
              ? `La clé « ${header} » est vide — chaque ligne doit être identifiée.`
              : `« ${header} » est obligatoire (*) mais vide.`,
            suggestion: isKey
              ? "Renseigner la clé avant tout chargement — sans elle, la ligne est inexploitable."
              : `Renseigner « ${header} » : champ obligatoire (*), le Cockpit rejettera la ligne.`,
          });
        }
      }
    });
  }

  // ---------- R2 : cohérence parent ↔ enfant ----------
  for (const link of links) {
    const parent = modelOf(link.parentSheet);
    if (!parent) continue;
    const parentRows = rowsOf(link.parentSheet);
    const childRows = rowsOf(link.childSheet);

    const parentKeys = new Map<string, string>(); // normalisée -> affichage
    for (const r of parentRows) {
      const raw = (r.cells[parent.headers[link.parentKeyIndex]] ?? "").trim();
      if (raw !== "" && !parentKeys.has(normalizeKey(raw))) parentKeys.set(normalizeKey(raw), raw);
    }

    const used = new Set<string>();
    const childHeader = modelOf(link.childSheet)?.headers[link.childKeyIndex] ?? "Clé";
    for (const r of childRows) {
      const raw = (r.cells[childHeader] ?? "").trim();
      if (raw === "") continue; // déjà signalé en R1
      const n = normalizeKey(raw);
      used.add(n);
      if (!parentKeys.has(n)) {
        issues.push({
          rowId: r.id,
          sheet: r.sheet,
          lineNo: r.lineNo,
          rule: "R2",
          type: "consistency",
          severity: "blocking",
          field: childHeader,
          message: `« ${raw} » n'existe pas dans « ${link.parentSheet} » — enregistrement master manquant.`,
          suggestion: `Créer « ${raw} » dans « ${link.parentSheet} » ou corriger la clé (casse et espaces ignorés).`,
          related: raw,
        });
      }
    }

    // Orphelins : clés parent jamais utilisées → warning sur la ligne parent.
    for (const r of parentRows) {
      const raw = (r.cells[parent.headers[link.parentKeyIndex]] ?? "").trim();
      if (raw === "" || used.has(normalizeKey(raw))) continue;
      issues.push({
        rowId: r.id,
        sheet: r.sheet,
        lineNo: r.lineNo,
        rule: "R2",
        type: "consistency",
        severity: "warning",
        field: parent.headers[link.parentKeyIndex],
        message: `« ${raw} » n'est affecté dans aucune ligne de « ${link.childSheet} ».`,
        suggestion: `Vérifier : affectation manquante dans « ${link.childSheet} », ou enregistrement inutile à retirer.`,
        related: link.childSheet,
      });
    }
  }

  // ---------- R3 : doublons intra-feuille ----------
  // Clé unique détectée → doublons sur la clé.
  // Sinon (feuille enfant type affectation) → lignes strictement identiques.
  const childSheets = new Set(links.map((l) => l.childSheet));
  for (const sheet of live) {
    const sheetRows = rowsOf(sheet.name);
    if (sheet.keyColumnIndex !== null) {
      const header = sheet.headers[sheet.keyColumnIndex];
      const groups = new Map<string, DataRow[]>();
      for (const r of sheetRows) {
        if (r.key === "") continue; // déjà signalé en R1
        const n = normalizeKey(r.key);
        const arr = groups.get(n) ?? [];
        arr.push(r);
        groups.set(n, arr);
      }
      for (const [, arr] of groups) {
        if (arr.length < 2) continue;
        const lines = arr.map((r) => r.lineNo).join(", ");
        for (const r of arr) {
          issues.push({
            rowId: r.id,
            sheet: r.sheet,
            lineNo: r.lineNo,
            rule: "R3",
            type: "duplicate",
            severity: "blocking",
            field: header,
            message: `Doublon : la clé « ${r.key} » apparaît ${arr.length} fois (lignes ${lines}).`,
            suggestion:
              "Ne garder qu'un enregistrement de référence et fusionner les données — le Cockpit refuse les clés en double.",
            related: lines,
          });
        }
      }
    } else if (childSheets.has(sheet.name)) {
      const groups = new Map<string, DataRow[]>();
      for (const r of sheetRows) {
        const sig = sheet.headers.map((h) => normalizeKey(r.cells[h] ?? "")).join(" | ");
        const arr = groups.get(sig) ?? [];
        arr.push(r);
        groups.set(sig, arr);
      }
      for (const [, arr] of groups) {
        if (arr.length < 2) continue;
        const lines = arr.map((r) => r.lineNo).join(", ");
        for (const r of arr) {
          issues.push({
            rowId: r.id,
            sheet: r.sheet,
            lineNo: r.lineNo,
            rule: "R3",
            type: "duplicate",
            severity: "blocking",
            field: "Ligne",
            message: `Doublon : ligne identique répétée ${arr.length} fois (lignes ${lines}).`,
            suggestion: "Supprimer les répétitions — une seule affectation par combinaison suffit.",
            related: lines,
          });
        }
      }
    }
  }

  // ---------- Synthèse ----------
  const badRows = new Set(issues.map((i) => i.rowId));
  const rowsFor = (rule: "R1" | "R2" | "R3") =>
    new Set(issues.filter((i) => i.rule === rule).map((i) => i.rowId)).size;

  return {
    fileName,
    objectType: "profit-center",
    summary: {
      total: rows.length,
      valid: rows.length - badRows.size,
      mandatoryMissing: rowsFor("R1"),
      inconsistent: rowsFor("R2"),
      duplicates: rowsFor("R3"),
    },
    issues,
    rows,
    sheets: live.map(
      (s): DetectedSheet => ({
        name: s.name,
        headers: s.headers,
        labels: s.labels,
        keyColumn: s.keyColumnIndex !== null ? s.headers[s.keyColumnIndex] : null,
        keyConfidence: Math.round(s.keyConfidence * 100) / 100,
        mandatoryColumns: s.mandatoryIndexes.map((i) => s.headers[i]),
        skipped: s.skipped,
      })
    ),
    links: links.map(
      (l): DetectedLink => ({
        parentSheet: l.parentSheet,
        childSheet: l.childSheet,
        keyColumn:
          modelOf(l.parentSheet)?.headers[l.parentKeyIndex] ??
          modelOf(l.childSheet)?.headers[l.childKeyIndex] ??
          "Clé",
        overlap: Math.round(l.overlap * 100) / 100,
      })
    ),
    generatedAt: new Date().toISOString(),
  };
}
