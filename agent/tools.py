"""Outils LangChain de l'agent — lecture seule sur le rapport déterministe.

L'agent ne devine jamais : il interroge ces outils puis explique en français.
Registre de sessions : alimenté par server.py (POST /analyze).
"""
from __future__ import annotations

from collections import OrderedDict
from typing import Any

from langchain_core.tools import tool

SESSIONS: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
MAX_SESSIONS = 50


def store_session(session_id: str, report: dict) -> None:
    SESSIONS[session_id] = {"report": report}
    SESSIONS.move_to_end(session_id)
    while len(SESSIONS) > MAX_SESSIONS:
        SESSIONS.popitem(last=False)


def _report(session_id: str) -> dict:
    try:
        return SESSIONS[session_id]["report"]
    except KeyError:
        raise ValueError(f"Session inconnue : {session_id}. Déposez d'abord un classeur.")


@tool
def get_summary(session_id: str) -> dict:
    """Synthèse du contrôle : scores, feuilles détectées, clés, colonnes
    obligatoires et liens entre feuilles. À appeler en premier."""
    r = _report(session_id)
    return {
        "file": r["fileName"],
        "summary": r["summary"],
        "sheets": r["sheets"],
        "links": r["links"],
    }


@tool
def list_issues(
    session_id: str, rule: str = "all", severity: str = "all",
    sheet: str = "all", limit: int = 20,
) -> dict:
    """Liste les anomalies. rule: R1, R2, R3 ou all. severity: blocking,
    warning ou all. sheet: nom de feuille ou all. limit: max 50."""
    r = _report(session_id)
    out = [
        i for i in r["issues"]
        if (rule == "all" or i["rule"] == rule)
        and (severity == "all" or i["severity"] == severity)
        and (sheet == "all" or i["sheet"] == sheet)
    ]
    return {"total": len(out), "issues": out[: max(1, min(limit, 50))]}


@tool
def row_detail(session_id: str, sheet: str, line: int) -> dict:
    """Détail d'une ligne : toutes ses cellules + ses anomalies et corrections."""
    r = _report(session_id)
    row = next(
        (x for x in r["rows"] if x["sheet"] == sheet and x["lineNo"] == line), None
    )
    if row is None:
        return {"error": f"Ligne {line} introuvable dans « {sheet} »."}
    return {
        "row": row,
        "issues": [i for i in r["issues"] if i["rowId"] == row["id"]],
    }


@tool
def explain_rule(rule: str) -> dict:
    """Définition exacte d'une règle (R1, R2 ou R3). À citer telle quelle."""
    rules = {
        "R1": "Champs obligatoires : toute colonne marquée * et la colonne clé doivent être remplies. Vide = bloquant.",
        "R2": "Cohérence : une clé enfant absente du parent = bloquant (master manquant) ; une clé parent jamais utilisée = avertissement (orphelin).",
        "R3": "Doublons : clé répétée dans une feuille, ou lignes strictement identiques dans une feuille d'affectation = bloquant.",
    }
    return {"rule": rule, "definition": rules.get(rule, "Code de règle inconnu.")}


@tool
def get_column_pareto(session_id: str, sheet: str = "all") -> dict:
    """Analyse de Pareto des colonnes : liste les colonnes les plus fautives avec le nombre
    d'anomalies bloquantes et avertissements. Utile pour identifier les causes racines de masse."""
    r = _report(session_id)
    counts: dict[str, dict[str, int]] = {}
    for i in r["issues"]:
        if sheet != "all" and i["sheet"] != sheet:
            continue
        col = i.get("column") or i.get("field") or "Général"
        if col not in counts:
            counts[col] = {"blocking": 0, "warning": 0, "total": 0}
        if i["severity"] == "blocking":
            counts[col]["blocking"] += 1
        else:
            counts[col]["warning"] += 1
        counts[col]["total"] += 1
    sorted_cols = sorted(counts.items(), key=lambda x: x[1]["total"], reverse=True)
    return {
        "sheet": sheet,
        "columns": [{"column": col, **stats} for col, stats in sorted_cols[:10]],
    }


@tool
def get_duplicate_clusters(session_id: str, sheet: str = "all") -> dict:
    """Regroupe toutes les lignes en doublon par clé identique (règle R3).
    Retourne la clé dupliquée, le nombre d'occurrences et les numéros de lignes Excel."""
    r = _report(session_id)
    key_groups: dict[str, list[int]] = {}
    for i in r["issues"]:
        if i["rule"] != "R3":
            continue
        if sheet != "all" and i["sheet"] != sheet:
            continue
        row_id = i["rowId"]
        row = next((x for x in r["rows"] if x["id"] == row_id), None)
        if not row:
            continue
        key_val = row.get("key") or "vide"
        key_groups.setdefault(key_val, []).append(row["lineNo"])

    clusters = [
        {"key": k, "count": len(lines), "lines": sorted(list(set(lines)))}
        for k, lines in key_groups.items()
    ]
    clusters.sort(key=lambda x: x["count"], reverse=True)
    return {"total_duplicate_keys": len(clusters), "clusters": clusters[:15]}

