"""Règles R1/R2/R3 — port Python de lib/data-quality-engine.ts."""
from __future__ import annotations

from datetime import datetime, timezone

from detect import SheetLink, SheetModel, normalize_key


def _empty(v: str) -> bool:
    return v.strip() == ""


def analyze_workbook(
    sheets: list[SheetModel], links: list[SheetLink], file_name: str
) -> dict:
    issues: list[dict] = []
    rows: list[dict] = []
    live = [s for s in sheets if not s.ignored]

    for si, sheet in enumerate(live):
        for i, cells in enumerate(sheet.rows):
            key = (
                cells[sheet.key_column_index].strip()
                if sheet.key_column_index is not None
                else ""
            )
            rows.append(
                {
                    "id": f"s{si}-r{i}",
                    "sheet": sheet.name,
                    "lineNo": sheet.line_nos[i],
                    "key": key,
                    "cells": {h: cells[c] for c, h in enumerate(sheet.headers)},
                }
            )

    def rows_of(name: str) -> list[dict]:
        return [r for r in rows if r["sheet"] == name]

    def model_of(name: str) -> SheetModel | None:
        return next((s for s in live if s.name == name), None)

    # ---------- R1 : champs obligatoires ----------
    for sheet in live:
        required = set(sheet.mandatory_indexes)
        if sheet.key_column_index is not None:
            required.add(sheet.key_column_index)
        sheet_rows = rows_of(sheet.name)
        for idx, r in enumerate(sheet_rows):
            cells = sheet.rows[idx]
            for c in sorted(required):
                if _empty(cells[c]):
                    header = sheet.headers[c]
                    is_key = c == sheet.key_column_index
                    issues.append(
                        {
                            "rowId": r["id"],
                            "sheet": sheet.name,
                            "lineNo": r["lineNo"],
                            "rule": "R1",
                            "type": "missing" if is_key else "mandatory",
                            "severity": "blocking",
                            "field": header,
                            "message": (
                                f"La clé « {header} » est vide — chaque ligne doit être identifiée."
                                if is_key
                                else f"« {header} » est obligatoire (*) mais vide."
                            ),
                            "suggestion": (
                                "Renseigner la clé avant tout chargement — sans elle, la ligne est inexploitable."
                                if is_key
                                else f"Renseigner « {header} » : champ obligatoire (*), le Cockpit rejettera la ligne."
                            ),
                        }
                    )

    # ---------- R2 : cohérence parent ↔ enfant ----------
    for link in links:
        parent = model_of(link.parent_sheet)
        if parent is None:
            continue
        parent_rows = rows_of(link.parent_sheet)
        child_rows = rows_of(link.child_sheet)

        parent_keys: dict[str, str] = {}
        for r in parent_rows:
            raw = r["cells"].get(parent.headers[link.parent_key_index], "").strip()
            if raw and normalize_key(raw) not in parent_keys:
                parent_keys[normalize_key(raw)] = raw

        used: set[str] = set()
        child_model = model_of(link.child_sheet)
        child_header = (
            child_model.headers[link.child_key_index] if child_model else "Clé"
        )
        for r in child_rows:
            raw = r["cells"].get(child_header, "").strip()
            if not raw:
                continue  # déjà signalé en R1
            n = normalize_key(raw)
            used.add(n)
            if n not in parent_keys:
                issues.append(
                    {
                        "rowId": r["id"],
                        "sheet": r["sheet"],
                        "lineNo": r["lineNo"],
                        "rule": "R2",
                        "type": "consistency",
                        "severity": "blocking",
                        "field": child_header,
                        "message": f"« {raw} » n'existe pas dans « {link.parent_sheet} » — enregistrement master manquant.",
                        "suggestion": f"Créer « {raw} » dans « {link.parent_sheet} » ou corriger la clé (casse et espaces ignorés).",
                        "related": raw,
                    }
                )

        for r in parent_rows:
            raw = r["cells"].get(parent.headers[link.parent_key_index], "").strip()
            if not raw or normalize_key(raw) in used:
                continue
            issues.append(
                {
                    "rowId": r["id"],
                    "sheet": r["sheet"],
                    "lineNo": r["lineNo"],
                    "rule": "R2",
                    "type": "consistency",
                    "severity": "warning",
                    "field": parent.headers[link.parent_key_index],
                    "message": f"« {raw} » n'est affecté dans aucune ligne de « {link.child_sheet} ».",
                    "suggestion": f"Vérifier : affectation manquante dans « {link.child_sheet} », ou enregistrement inutile à retirer.",
                    "related": link.child_sheet,
                }
            )

    # ---------- R3 : doublons ----------
    child_sheets = {link.child_sheet for link in links}
    for sheet in live:
        sheet_rows = rows_of(sheet.name)
        if sheet.key_column_index is not None:
            header = sheet.headers[sheet.key_column_index]
            groups: dict[str, list[dict]] = {}
            for r in sheet_rows:
                if not r["key"]:
                    continue  # déjà signalé en R1
                groups.setdefault(normalize_key(r["key"]), []).append(r)
            for arr in groups.values():
                if len(arr) < 2:
                    continue
                lines = ", ".join(str(r["lineNo"]) for r in arr)
                for r in arr:
                    issues.append(
                        {
                            "rowId": r["id"],
                            "sheet": r["sheet"],
                            "lineNo": r["lineNo"],
                            "rule": "R3",
                            "type": "duplicate",
                            "severity": "blocking",
                            "field": header,
                            "message": f"Doublon : la clé « {r['key']} » apparaît {len(arr)} fois (lignes {lines}).",
                            "suggestion": "Ne garder qu'un enregistrement de référence et fusionner les données — le Cockpit refuse les clés en double.",
                            "related": lines,
                        }
                    )
        elif sheet.name in child_sheets:
            groups = {}
            for r in sheet_rows:
                sig = " | ".join(
                    normalize_key(r["cells"].get(h, "")) for h in sheet.headers
                )
                groups.setdefault(sig, []).append(r)
            for arr in groups.values():
                if len(arr) < 2:
                    continue
                lines = ", ".join(str(r["lineNo"]) for r in arr)
                for r in arr:
                    issues.append(
                        {
                            "rowId": r["id"],
                            "sheet": r["sheet"],
                            "lineNo": r["lineNo"],
                            "rule": "R3",
                            "type": "duplicate",
                            "severity": "blocking",
                            "field": "Ligne",
                            "message": f"Doublon : ligne identique répétée {len(arr)} fois (lignes {lines}).",
                            "suggestion": "Supprimer les répétitions — une seule affectation par combinaison suffit.",
                            "related": lines,
                        }
                    )

    # ---------- Synthèse ----------
    bad = {i["rowId"] for i in issues}

    def rows_for(rule: str) -> int:
        return len({i["rowId"] for i in issues if i["rule"] == rule})

    return {
        "fileName": file_name,
        "objectType": "profit-center",
        "summary": {
            "total": len(rows),
            "valid": len(rows) - len(bad),
            "mandatoryMissing": rows_for("R1"),
            "inconsistent": rows_for("R2"),
            "duplicates": rows_for("R3"),
        },
        "issues": issues,
        "rows": rows,
        "sheets": [
            {
                "name": s.name,
                "headers": s.headers,
                "labels": s.labels,
                "keyColumn": s.headers[s.key_column_index]
                if s.key_column_index is not None
                else None,
                "keyConfidence": round(s.key_confidence, 2),
                "mandatoryColumns": [s.headers[i] for i in s.mandatory_indexes],
                "skipped": s.skipped,
            }
            for s in live
        ],
        "links": [
            {
                "parentSheet": link.parent_sheet,
                "childSheet": link.child_sheet,
                "keyColumn": (
                    (model_of(link.parent_sheet).headers[link.parent_key_index])
                    if model_of(link.parent_sheet)
                    else (
                        model_of(link.child_sheet).headers[link.child_key_index]
                        if model_of(link.child_sheet)
                        else "Clé"
                    )
                ),
                "overlap": round(link.overlap, 2),
            }
            for link in links
        ],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
