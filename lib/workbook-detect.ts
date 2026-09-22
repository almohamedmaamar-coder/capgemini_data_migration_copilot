import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";

export interface SheetModel {
  name: string;
  /** En-têtes nettoyés (astérisque retiré, espaces rognés). */
  headers: string[];
  /** Libellés d'affichage (ligne de documentation SAP, sinon nom technique). */
  labels: string[];
  /** En-têtes bruts tels que lus. */
  rawHeaders: string[];
  /** Index 0-based de la ligne d'en-tête dans la feuille. */
  headerRowIndex: number;
  /** Lignes de données (cellules en chaînes). */
  rows: string[][];
  /** Numéros de ligne Excel (1-based) parallèles à rows. */
  lineNos: number[];
  /** Numéro de ligne Excel (1-based) de rows[0]. */
  startLineNo: number;
  /** Index de la colonne clé détectée, null si aucune fiable. */
  keyColumnIndex: number | null;
  keyConfidence: number;
  /** Index des colonnes obligatoires (en-tête avec * ou ligne de doc). */
  mandatoryIndexes: number[];
  /** Lignes techniques ignorées (formats, sections, documentation). */
  skipped: number;
  /** Feuille ignorée (pas de tableau détecté). */
  ignored: boolean;
}

export interface SheetLink {
  parentSheet: string;
  childSheet: string;
  parentKeyIndex: number;
  childKeyIndex: number;
  overlap: number;
}

const KEY_NAME_HINT =
  /(id|key|clé|cle|code|n°|\bno\b|\bnr\b|num|center|centre|prctr|profit)/i;

// Ligne de formats SAP type « ETE;80;0;C;80;0 », « EDA;8;0;D;8;0 », « C(10) », « D(8) ».
const FORMAT_CELL =
  /^([A-Z]{2,4};\d+;|[CDINP]\(\d+(?:,\d+)?\)|CHAR\s*\d+|NUMC\s*\d+|DATS\s*\d+)/i;
// Fenêtre de tête où vivent les lignes techniques des templates SAP.
const LEAD_WINDOW = 12;

const DOC_SHEET_NAMES =
  /^(field\s*list|introduction|instructions|overview|read\s*me|readme|documentation|help|notes|sommaire|notice)$/i;

const KNOWN_HEADERS = [
  /\bcontrolling\s*area\b/i,
  /\bprofit\s*cent(er|re)\b/i,
  /\bvalid[-\s]*from\b/i,
  /\bvalid[-\s]*to\b/i,
  /\blanguage\b/i,
  /\blangue\b/i,
  /\btext\b/i,
  /\bdesc(ription)?\b/i,
  /\bcompany\s*code\b/i,
  /\bsoci[eé]t[eé]\b/i,
  /\bp[eé]rim[eè]tre\b/i,
  /\bstatus\b/i,
  /\bstatut\b/i,
  /\brespons(a|i)ble\b/i,
  /\bcode\b/i,
  /\bdate\b/i,
  /\b(kokrs|prctr|datab|datbi|spras|ktext|bukrs|verak)\b/i,
];

const MAX_SCAN_ROWS = 20000;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  return String(v);
}

/** Normalisation pour comparaison de clés : rogné + casse repliée. */
export function normalizeKey(v: string): string {
  return v.trim().toUpperCase().replace(/\s+/g, " ");
}

/**
 * Calcule un score pour déterminer si une ligne est la vraie ligne d'en-tête.
 * Privilégie fortement les libellés métier avec étoiles SAP (*) et noms de champs reconnus.
 */
export function scoreHeaderRow(row: string[]): number {
  const cells = row.map((c) => (c ?? "").split("\n")[0].trim());
  const nonEmpty = cells.filter((c) => c !== "");
  if (nonEmpty.length < 2) return -999;

  let score = 0;

  // 1. Unicité (élimine les sections fusionnées "General Data" répétées)
  const distinct = new Set(nonEmpty.map((c) => c.toLowerCase()));
  const uniqueness = distinct.size / nonEmpty.length;
  if (uniqueness < 0.6) {
    score -= 100;
  } else {
    score += uniqueness * 25;
  }

  // 2. Étoiles (*) des champs obligatoires SAP (ex: "Controlling area*", "Profit center*")
  const asteriskCount = nonEmpty.filter((c) => c.includes("*")).length;
  score += asteriskCount * 35;

  // 3. Mots-clés SAP / Profit Center connus
  const knownCount = nonEmpty.filter((c) => KNOWN_HEADERS.some((re) => re.test(c))).length;
  score += knownCount * 20;

  // 4. Libellés descriptifs métier avec espaces ou minuscules/majuscules
  const descriptiveCount = nonEmpty.filter(
    (c) => /\s/.test(c) || (c.length > 3 && /[a-z]/.test(c))
  ).length;
  score += descriptiveCount * 5;

  // 5. Pénalité lignes de formats techniques
  const formatCount = nonEmpty.filter((c) => FORMAT_CELL.test(c)).length;
  if (formatCount / nonEmpty.length >= 0.3) {
    score -= 200;
  }

  // 6. Pénalité lignes de données pures (nombres, dates)
  const dataCount = nonEmpty.filter(
    (c) => /^\d+$/.test(c) || /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$/.test(c)
  ).length;
  if (dataCount / nonEmpty.length >= 0.3) {
    score -= 150;
  }

  // 7. Nombre de colonnes couvertes
  score += Math.min(nonEmpty.length, 20);

  // 8. Taux de texte
  const textLikeCount = nonEmpty.filter((c) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(c)).length;
  if (textLikeCount / nonEmpty.length < 0.5) {
    score -= 80;
  }

  return score;
}

function findHeaderRow(grid: string[][]): number {
  const limit = Math.min(25, grid.length);
  let bestRow = -1;
  let bestScore = 0;

  for (let r = 0; r < limit; r++) {
    const s = scoreHeaderRow(grid[r]);
    if (s > bestScore) {
      bestScore = s;
      bestRow = r;
    }
  }

  if (bestRow !== -1) return bestRow;

  // Repli si aucun score strictement positif : première ligne textuelle valide
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const row = grid[r];
    const nonEmpty = row.filter((c) => c.trim() !== "");
    if (nonEmpty.length < 3) continue;
    const textLike = nonEmpty.filter((c) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(c)).length;
    if (textLike / nonEmpty.length >= 0.5) return r;
  }
  return -1;
}

interface ColStats {
  index: number;
  fillRate: number;
  uniqueness: number;
  score: number;
}

function columnStats(rows: string[][], colCount: number): ColStats[] {
  const n = rows.length;
  const out: ColStats[] = [];
  for (let c = 0; c < colCount; c++) {
    const vals = rows.map((r) => r[c] ?? "").filter((v) => v !== "");
    const fillRate = n === 0 ? 0 : vals.length / n;
    const distinct = new Set(vals.map(normalizeKey)).size;
    const uniqueness = vals.length === 0 ? 0 : distinct / vals.length;
    out.push({ index: c, fillRate, uniqueness, score: 0.5 * fillRate + 0.5 * uniqueness });
  }
  return out;
}

function nonEmpty(cells: string[]): string[] {
  return cells.filter((c) => c.trim() !== "");
}

function isFormatRow(cells: string[]): boolean {
  const ne = nonEmpty(cells);
  if (ne.length === 0) return false;
  return ne.filter((c) => FORMAT_CELL.test(c.trim())).length / ne.length >= 0.3;
}

function isDocRow(cells: string[]): boolean {
  const ne = nonEmpty(cells);
  if (ne.length < 3) return false;
  const avg = ne.reduce((s, c) => s + c.trim().length, 0) / ne.length;
  return avg > 100;
}

/** Ligne de section type « Main data … Basic data » : répétitions ou mots-clés de section. */
function isLabelRow(cells: string[]): boolean {
  const ne = nonEmpty(cells);
  if (ne.length === 0) return false;
  const distinct = new Set(ne.map((c) => c.toLowerCase()));
  const uniqueness = distinct.size / ne.length;
  // Une ligne de section a des libellés dupliqués ou mentionne explicitement "Data" / "Section"
  const isSectionWords = ne.some((c) => /(basic|general|main|additional)\s*data/i.test(c));
  if (uniqueness < 0.6 || isSectionWords) {
    return ne.every((c) => c.trim().length <= 60 && !/\d/.test(c.trim()));
  }
  return false;
}

/**
 * Obligatoires lus sur la ligne de documentation SAP : la 1re ligne de chaque
 * cellule doc se termine par * si le champ est obligatoire (aligné par colonne).
 */
function mandatoryFromDoc(docCells: string[]): boolean[] {
  return docCells.map((c) => {
    const first = c.split("\n")[0].trim();
    return first.endsWith("*");
  });
}

/**
 * Libellé d'affichage depuis la doc SAP : 1re ligne TELLE QUELLE, * incluse
 * (« Profit center* » reste « Profit center* », comme dans Excel).
 */
function labelFromDoc(cell: string): string | null {
  const first = cell.split("\n")[0].trim();
  return first.length >= 2 ? first : null;
}

function detectKey(
  rows: string[][],
  headers: string[]
): { index: number | null; confidence: number } {
  if (rows.length < 3) return { index: null, confidence: 0 };
  const stats = columnStats(rows, headers.length);
  // Passe 1 : colonne au nom « clé » (PRCTR, MATNR…) avec unicité réaliste.
  // Les vrais doublons (cas R3) ne doivent pas disqualifier la clé.
  const hinted = stats
    .filter(
      (s) =>
        s.fillRate >= 0.9 &&
        s.uniqueness >= 0.8 &&
        KEY_NAME_HINT.test(headers[s.index])
    )
    .sort((a, b) => b.uniqueness - a.uniqueness || b.score - a.score);
  if (hinted.length > 0) {
    return { index: hinted[0].index, confidence: hinted[0].score + 0.15 };
  }
  // Passe 2 : stricte, sans indice de nom.
  const cands = stats
    .filter((s) => s.fillRate >= 0.9 && s.uniqueness >= 0.95)
    .map((s) => ({
      ...s,
      hint: KEY_NAME_HINT.test(headers[s.index]),
      boosted: s.score + (KEY_NAME_HINT.test(headers[s.index]) ? 0.1 : 0),
    }))
    .sort((a, b) =>
      a.hint !== b.hint ? (a.hint ? -1 : 1) : b.boosted - a.boosted
    );
  if (cands.length === 0) return { index: null, confidence: 0 };
  return { index: cands[0].index, confidence: cands[0].boosted };
}

export function buildSheetModelFromGrid(
  name: string,
  clean: string[][],
  headerRowIndex: number
): SheetModel {
  if (headerRowIndex < 0 || headerRowIndex >= clean.length) {
    return {
      name,
      headers: [],
      labels: [],
      rawHeaders: [],
      headerRowIndex: -1,
      rows: [],
      lineNos: [],
      startLineNo: 0,
      keyColumnIndex: null,
      keyConfidence: 0,
      mandatoryIndexes: [],
      skipped: 0,
      ignored: true,
    };
  }

  let rawHeaders = clean[headerRowIndex].map((h) => (h ?? "").split("\n")[0].trim());
  const seen = new Map<string, number>();
  let headers = rawHeaders.map((h, i) => {
    const base = h.replace(/\*/g, "").trim() || `Colonne ${i + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const dataStart = headerRowIndex + 1;
  let entries = clean
    .slice(dataStart)
    .map((r, i) => ({ r, lineNo: dataStart + i + 1 })) // +1 : lignes Excel en 1-based
    .filter(({ r }) => r.some((c) => c.trim() !== ""));

  const pad = (r: string[]) => {
    const out = r.slice(0, headers.length);
    while (out.length < headers.length) out.push("");
    return out;
  };

  // Passe A : lignes de formats + documentation (motifs extrêmes, partout).
  let skipped = 0;
  let docFlags: boolean[] | null = null;
  let docCells: string[] | null = null;
  entries = entries.filter(({ r }) => {
    const cells = pad(r);
    if (isFormatRow(cells)) {
      skipped++;
      return false;
    }
    if (isDocRow(cells)) {
      skipped++;
      if (!docFlags) {
        docFlags = mandatoryFromDoc(cells);
        docCells = cells;
      }
      return false;
    }
    return true;
  });

  // Retire les colonnes vides traînantes (« Colonne N » + aucune valeur).
  for (let c = headers.length - 1; c >= 0; c--) {
    if (!headers[c].startsWith("Colonne ")) break;
    if (entries.some(({ r }) => (r[c] ?? "").trim() !== "")) break;
    headers = headers.filter((_, i) => i !== c);
    rawHeaders = rawHeaders.filter((_, i) => i !== c);
    if (docFlags !== null) {
      const flags: boolean[] = docFlags;
      docFlags = flags.filter((_, i) => i !== c);
    }
    if (docCells !== null) {
      const dcells: string[] = docCells;
      docCells = dcells.filter((_, i) => i !== c);
    }
  }

  // Passe C : lignes de section en tête (fenêtre, arrêt à la 1re ligne de données).
  let scanning = true;
  const kept: { r: string[]; lineNo: number }[] = [];
  entries.forEach(({ r, lineNo }, i) => {
    const cells = pad(r);
    if (scanning) {
      if (i < LEAD_WINDOW && isLabelRow(cells)) {
        skipped++;
        return;
      }
      scanning = false;
    }
    kept.push({ r: cells, lineNo });
  });
  const rows = kept.map((k) => k.r);
  const lineNos = kept.map((k) => k.lineNo);

  // Passe D : clé finale + obligatoires (en-tête * ∪ ligne de doc).
  const key = detectKey(rows, headers);
  const mandatoryIndexes = headers
    .map((_, i) => i)
    .filter(
      (i) =>
        rawHeaders[i]?.includes("*") ||
        (docFlags?.[i] ?? false)
    );
  const labels = headers.map((h, i) => {
    if (docCells?.[i]) return labelFromDoc(docCells[i]) ?? h;
    const raw = rawHeaders[i]?.trim();
    return raw || h;
  });

  return {
    name,
    headers,
    labels,
    rawHeaders,
    headerRowIndex,
    rows,
    lineNos,
    startLineNo: lineNos[0] ?? headerRowIndex + 2,
    keyColumnIndex: key.index,
    keyConfidence: Math.round(key.confidence * 100) / 100,
    mandatoryIndexes,
    skipped,
    ignored: false,
  };
}

export function detectSheetLinks(sheets: SheetModel[]): SheetLink[] {
  const links: SheetLink[] = [];
  const usable = sheets.filter((s) => !s.ignored && s.rows.length > 0);
  for (let a = 0; a < usable.length; a++) {
    for (let b = a + 1; b < usable.length; b++) {
      const A = usable[a];
      const B = usable[b];
      const statsA = columnStats(A.rows, A.headers.length).filter((s) => s.fillRate >= 0.9);
      const statsB = columnStats(B.rows, B.headers.length).filter((s) => s.fillRate >= 0.9);
      let best: SheetLink | null = null;
      for (const sa of statsA) {
        const setA = new Set(A.rows.map((r) => normalizeKey(r[sa.index])));
        for (const sb of statsB) {
          const setB = new Set(B.rows.map((r) => normalizeKey(r[sb.index])));
          const inter = [...setA].filter((v) => setB.has(v)).length;
          const overlap = inter / Math.min(setA.size, setB.size || 1);
          if (setA.size === 0 || setB.size === 0 || overlap < 0.5) continue;
          if (Math.min(setA.size, setB.size) < 5) continue;
          if (Math.max(sa.uniqueness, sb.uniqueness) < 0.9) continue;
          const aUnique = sa.uniqueness >= 0.95;
          const bUnique = sb.uniqueness >= 0.95;
          const parentIsA = aUnique && !bUnique ? true : !aUnique && bUnique ? false : setA.size >= setB.size;
          const candidate: SheetLink = parentIsA
            ? { parentSheet: A.name, childSheet: B.name, parentKeyIndex: sa.index, childKeyIndex: sb.index, overlap }
            : { parentSheet: B.name, childSheet: A.name, parentKeyIndex: sb.index, childKeyIndex: sa.index, overlap };
          if (!best || candidate.overlap > best.overlap) best = candidate;
        }
      }
      if (best) links.push(best);
    }
  }
  return links;
}

export function detectWorkbook(wb: WorkBook): {
  sheets: SheetModel[];
  links: SheetLink[];
  rawGrids: Record<string, string[][]>;
} {
  const sheets: SheetModel[] = [];
  const rawGrids: Record<string, string[][]> = {};

  for (const name of wb.SheetNames) {
    if (DOC_SHEET_NAMES.test(name.trim())) {
      sheets.push({
        name,
        headers: [],
        labels: [],
        rawHeaders: [],
        headerRowIndex: -1,
        rows: [],
        lineNos: [],
        startLineNo: 0,
        keyColumnIndex: null,
        keyConfidence: 0,
        mandatoryIndexes: [],
        skipped: 0,
        ignored: true,
      });
      continue;
    }

    const ws = wb.Sheets[name];
    const grid: string[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as string[][];
    const clean = grid.map((r) => r.map(cell)).slice(0, MAX_SCAN_ROWS);
    rawGrids[name] = clean;

    const headerRowIndex = findHeaderRow(clean);
    const model = buildSheetModelFromGrid(name, clean, headerRowIndex);
    sheets.push(model);
  }

  const links = detectSheetLinks(sheets);
  return { sheets, links, rawGrids };
}
