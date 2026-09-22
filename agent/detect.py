"""Détection de structure : feuilles, en-têtes, colonnes *, clés, liens.

Port Python de lib/workbook-detect.ts — même heuristique, mêmes seuils.
Gère les templates SAP : ligne de formats, libellés de section, ligne de
documentation (qui porte les * obligatoires), puis données.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl.worksheet.worksheet import Worksheet

KEY_NAME_HINT = re.compile(
    r"(id|key|cl[ée]|code|n°|\bno\b|\bnr\b|num|center|centre|prctr|profit)", re.IGNORECASE
)
TEXT_LIKE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")
FORMAT_CELL = re.compile(
    r"^([A-Z]{2,4};\d+;|[CDINP]\(\d+(?:,\d+)?\)|CHAR\s*\d+|NUMC\s*\d+|DATS\s*\d+)", re.IGNORECASE
)
LEAD_WINDOW = 12
MAX_SCAN_ROWS = 20000

DOC_SHEET_NAMES = re.compile(
    r"^(field\s*list|introduction|instructions|overview|read\s*me|readme|documentation|help|notes|sommaire|notice)$",
    re.IGNORECASE,
)

KNOWN_HEADERS = [
    re.compile(r"\bcontrolling\s*area\b", re.I),
    re.compile(r"\bprofit\s*cent(er|re)\b", re.I),
    re.compile(r"\bvalid[-\s]*from\b", re.I),
    re.compile(r"\bvalid[-\s]*to\b", re.I),
    re.compile(r"\blanguage\b", re.I),
    re.compile(r"\blangue\b", re.I),
    re.compile(r"\btext\b", re.I),
    re.compile(r"\bdesc(ription)?\b", re.I),
    re.compile(r"\bcompany\s*code\b", re.I),
    re.compile(r"\bsoci[eé]t[eé]\b", re.I),
    re.compile(r"\bp[eé]rim[eè]tre\b", re.I),
    re.compile(r"\bstatus\b", re.I),
    re.compile(r"\bstatut\b", re.I),
    re.compile(r"\brespons(a|i)ble\b", re.I),
    re.compile(r"\bcode\b", re.I),
    re.compile(r"\bdate\b", re.I),
    re.compile(r"\b(kokrs|prctr|datab|datbi|spras|ktext|bukrs|verak)\b", re.I),
]


def cell_to_str(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return str(v).strip()
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, (datetime, date)):
        return v.isoformat(sep=" ")
    return str(v)


def normalize_key(v: str) -> str:
    return re.sub(r"\s+", " ", v.strip().upper())


@dataclass
class SheetModel:
    name: str
    headers: list[str] = field(default_factory=list)
    labels: list[str] = field(default_factory=list)
    raw_headers: list[str] = field(default_factory=list)
    header_row_index: int = -1
    rows: list[list[str]] = field(default_factory=list)
    line_nos: list[int] = field(default_factory=list)
    start_line_no: int = 0
    key_column_index: int | None = None
    key_confidence: float = 0.0
    mandatory_indexes: list[int] = field(default_factory=list)
    skipped: int = 0
    ignored: bool = False


@dataclass
class SheetLink:
    parent_sheet: str
    child_sheet: str
    parent_key_index: int
    child_key_index: int
    overlap: float


def score_header_row(row: list[str]) -> float:
    non_empty = [c.split("\n")[0].strip() for c in row if c and c.strip()]
    non_empty = [c for c in non_empty if c]
    if len(non_empty) < 2:
        return -999.0

    score = 0.0
    distinct = {c.lower() for c in non_empty}
    uniqueness = len(distinct) / len(non_empty)
    if uniqueness < 0.6:
        score -= 100.0
    else:
        score += uniqueness * 25.0

    asterisk_count = sum(1 for c in non_empty if "*" in c)
    score += asterisk_count * 30.0

    known_count = sum(1 for c in non_empty if any(p.search(c) for p in KNOWN_HEADERS))
    score += known_count * 20.0

    descriptive_count = sum(1 for c in non_empty if " " in c or (len(c) > 3 and re.search(r"[a-z]", c)))
    score += descriptive_count * 5.0

    format_count = sum(1 for c in non_empty if FORMAT_CELL.match(c))
    if format_count / len(non_empty) >= 0.3:
        score -= 200.0

    data_count = sum(1 for c in non_empty if re.match(r"^\d+$", c) or re.match(r"^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$", c))
    if data_count / len(non_empty) >= 0.3:
        score -= 150.0

    score += min(len(non_empty), 20)

    text_like_count = sum(1 for c in non_empty if TEXT_LIKE.search(c))
    if text_like_count / len(non_empty) < 0.5:
        score -= 80.0

    return score


def _find_header_row(grid: list[list[str]]) -> int:
    limit = min(25, len(grid))
    best_row = -1
    best_score = 0.0

    for r in range(limit):
        s = score_header_row(grid[r])
        if s > best_score:
            best_score = s
            best_row = r

    if best_row != -1:
        return best_row

    for r in range(min(10, len(grid))):
        row = grid[r]
        non_empty = [c for c in row if c != ""]
        if len(non_empty) < 3:
            continue
        text_like = sum(1 for c in non_empty if TEXT_LIKE.search(c))
        if text_like / len(non_empty) >= 0.5:
            return r
    return -1


def _column_stats(rows: list[list[str]], col_count: int) -> list[dict]:
    n = len(rows)
    out = []
    for c in range(col_count):
        vals = [r[c] for r in rows if r[c] != ""]
        fill_rate = (len(vals) / n) if n else 0.0
        distinct = len({normalize_key(v) for v in vals})
        uniqueness = (distinct / len(vals)) if vals else 0.0
        out.append(
            {"index": c, "fill_rate": fill_rate, "uniqueness": uniqueness,
             "score": 0.5 * fill_rate + 0.5 * uniqueness}
        )
    return out


def _non_empty(cells: list[str]) -> list[str]:
    return [c for c in cells if c.strip() != ""]


def _is_format_row(cells: list[str]) -> bool:
    ne = _non_empty(cells)
    if not ne:
        return False
    return sum(1 for c in ne if FORMAT_CELL.match(c.strip())) / len(ne) >= 0.3


def _is_doc_row(cells: list[str]) -> bool:
    ne = _non_empty(cells)
    if len(ne) < 3:
        return False
    return sum(len(c.strip()) for c in ne) / len(ne) > 100


def _is_label_row(cells: list[str]) -> bool:
    ne = _non_empty(cells)
    if not ne:
        return False
    distinct = {c.lower() for c in ne}
    uniqueness = len(distinct) / len(ne)
    is_section_words = any(re.search(r"(basic|general|main|additional)\s*data", c, re.I) for c in ne)
    if uniqueness < 0.6 or is_section_words:
        return all(len(c.strip()) <= 60 and not re.search(r"\d", c) for c in ne)
    return False


def _mandatory_from_doc(doc_cells: list[str]) -> list[bool]:
    out = []
    for c in doc_cells:
        first = c.split("\n")[0].strip()
        out.append(first.endswith("*"))
    return out


def _label_from_doc(cell: str) -> str | None:
    first = cell.split("\n")[0].strip()
    return first if len(first) >= 2 else None


def _detect_key(
    rows: list[list[str]], headers: list[str]
) -> tuple[int | None, float]:
    if len(rows) < 3:
        return None, 0.0
    stats = _column_stats(rows, len(headers))
    # Passe 1 : colonne au nom « clé » (PRCTR, MATNR…) avec unicité réaliste.
    # Les vrais doublons (cas R3) ne doivent pas disqualifier la clé.
    hinted = [
        s for s in stats
        if s["fill_rate"] >= 0.9 and s["uniqueness"] >= 0.8
        and KEY_NAME_HINT.search(headers[s["index"]])
    ]
    hinted.sort(key=lambda s: (-s["uniqueness"], -s["score"]))
    if hinted:
        return hinted[0]["index"], hinted[0]["score"] + 0.15
    # Passe 2 : stricte, sans indice de nom.
    strict = [s for s in stats if s["fill_rate"] >= 0.9 and s["uniqueness"] >= 0.95]
    if not strict:
        return None, 0.0
    strict.sort(
        key=lambda s: (
            not bool(KEY_NAME_HINT.search(headers[s["index"]])),
            -(s["score"] + (0.1 if KEY_NAME_HINT.search(headers[s["index"]]) else 0.0)),
        )
    )
    best = strict[0]
    hint = bool(KEY_NAME_HINT.search(headers[best["index"]]))
    return best["index"], best["score"] + (0.1 if hint else 0.0)


def _detect_sheet(name: str, ws: Worksheet) -> SheetModel:
    if DOC_SHEET_NAMES.match(name.strip()):
        return SheetModel(name=name, ignored=True)

    grid: list[list[str]] = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= MAX_SCAN_ROWS:
            break
        grid.append([cell_to_str(v) for v in row])

    header_row_index = _find_header_row(grid)
    if header_row_index == -1:
        return SheetModel(name=name, ignored=True)

    raw_headers = [c.split("\n")[0].strip() for c in grid[header_row_index]]
    seen: dict[str, int] = {}
    headers = []
    for i, h in enumerate(raw_headers):
        base = h.replace("*", "").strip() or f"Colonne {i + 1}"
        count = seen.get(base, 0)
        seen[base] = count + 1
        headers.append(base if count == 0 else f"{base} ({count + 1})")

    def pad(r: list[str]) -> list[str]:
        out = list(r[: len(headers)])
        out += [""] * (len(headers) - len(out))
        return out

    data_start = header_row_index + 1
    entries = [
        {"r": r, "line_no": data_start + i + 1}
        for i, r in enumerate(grid[data_start:])
        if any(c.strip() != "" for c in r)
    ]

    # Passe A : formats + documentation.
    skipped = 0
    doc_flags: list[bool] | None = None
    doc_cells: list[str] | None = None
    kept: list[dict] = []
    for e in entries:
        cells = pad(e["r"])
        if _is_format_row(cells):
            skipped += 1
            continue
        if _is_doc_row(cells):
            skipped += 1
            if doc_flags is None:
                doc_flags = _mandatory_from_doc(cells)
                doc_cells = cells
            continue
        kept.append({"r": cells, "line_no": e["line_no"]})

    # Retire les colonnes vides traînantes.
    while headers and headers[-1].startswith("Colonne "):
        if any(r["r"][-1].strip() != "" for r in kept):
            break
        headers.pop()
        raw_headers.pop()
        if doc_flags is not None:
            doc_flags.pop()
        if doc_cells is not None:
            doc_cells.pop()
        for r in kept:
            r["r"].pop()

    # Passe C : libellés de section en tête (pas besoin de la clé :
    # un libellé = texte court sans aucun chiffre).
    final: list[dict] = []
    scanning = True
    for i, e in enumerate(kept):
        if scanning:
            if i < LEAD_WINDOW and _is_label_row(e["r"]):
                skipped += 1
                continue
            scanning = False
        final.append(e)
    rows = [e["r"] for e in final]
    line_nos = [e["line_no"] for e in final]

    # Passe D : clé finale + obligatoires (en-tête * ∪ ligne de doc) + libellés.
    key_index, key_confidence = _detect_key(rows, headers)
    mandatory_indexes = [
        i
        for i in range(len(headers))
        if ("*" in (raw_headers[i] if i < len(raw_headers) else ""))
        or (doc_flags[i] if doc_flags and i < len(doc_flags) else False)
    ]
    labels = []
    for i, h in enumerate(headers):
        if doc_cells and i < len(doc_cells):
            labels.append(_label_from_doc(doc_cells[i]) or h)
        else:
            raw = raw_headers[i].strip() if i < len(raw_headers) else ""
            labels.append(raw or h)

    return SheetModel(
        name=name,
        headers=headers,
        labels=labels,
        raw_headers=raw_headers,
        header_row_index=header_row_index,
        rows=rows,
        line_nos=line_nos,
        start_line_no=line_nos[0] if line_nos else header_row_index + 2,
        key_column_index=key_index,
        key_confidence=key_confidence,
        mandatory_indexes=mandatory_indexes,
        skipped=skipped,
    )


def detect_workbook(sheets: dict[str, Worksheet]) -> tuple[list[SheetModel], list[SheetLink]]:
    models = [_detect_sheet(name, ws) for name, ws in sheets.items()]
    usable = [m for m in models if not m.ignored and m.rows]
    links: list[SheetLink] = []

    for a in range(len(usable)):
        for b in range(a + 1, len(usable)):
            A, B = usable[a], usable[b]
            stats_a = [s for s in _column_stats(A.rows, len(A.headers)) if s["fill_rate"] >= 0.9]
            stats_b = [s for s in _column_stats(B.rows, len(B.headers)) if s["fill_rate"] >= 0.9]
            best: SheetLink | None = None
            for sa in stats_a:
                set_a = {normalize_key(r[sa["index"]]) for r in A.rows}
                for sb in stats_b:
                    set_b = {normalize_key(r[sb["index"]]) for r in B.rows}
                    inter = len(set_a & set_b)
                    overlap = inter / min(len(set_a), len(set_b) or 1)
                    # Garde-fous anti faux liens (petits ensembles, colonnes non discriminantes).
                    if not set_a or not set_b or overlap < 0.5:
                        continue
                    if min(len(set_a), len(set_b)) < 5:
                        continue
                    if max(sa["uniqueness"], sb["uniqueness"]) < 0.9:
                        continue
                    a_unique = sa["uniqueness"] >= 0.95
                    b_unique = sb["uniqueness"] >= 0.95
                    if a_unique and not b_unique:
                        parent_is_a = True
                    elif b_unique and not a_unique:
                        parent_is_a = False
                    else:
                        parent_is_a = len(set_a) >= len(set_b)
                    candidate = (
                        SheetLink(A.name, B.name, sa["index"], sb["index"], overlap)
                        if parent_is_a
                        else SheetLink(B.name, A.name, sb["index"], sa["index"], overlap)
                    )
                    if best is None or candidate.overlap > best.overlap:
                        best = candidate
            if best is not None:
                links.append(best)

    return models, links
