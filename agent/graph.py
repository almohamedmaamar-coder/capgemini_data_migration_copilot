"""Agent conversationnel LangGraph (pattern ReAct pré-construit)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from tools import (
    explain_rule,
    get_column_pareto,
    get_duplicate_clusters,
    get_summary,
    list_issues,
    row_detail,
)
from pydantic import BaseModel, Field

RULES_DOC = (Path(__file__).parent / "rules.md").read_text(encoding="utf-8")

SYSTEM_PROMPT = f"""Tu es l'agent qualité Profit Center d'un projet de migration SAP S/4HANA.
Tu réponds toujours en français, de façon courte et concrète.

{RULES_DOC}

Mode d'emploi :
- Chaque message utilisateur commence par [session: <id>] — utilise cet identifiant
  tel quel comme paramètre session_id de chaque outil, sans le demander.
- Commence par get_summary pour connaître le classeur, sauf si la question porte
  sur une ligne précise (row_detail) ou une règle (explain_rule).
- Utilise get_column_pareto pour savoir quelles colonnes concentrent les erreurs.
- Utilise get_duplicate_clusters pour regrouper les doublons par clé.
- Ne cite que des anomalies réellement retournées par les outils (feuille + ligne).
- Termine par l'action utile : renvoyer vers le tableau, une ligne, ou l'export.
- N'invente jamais de chiffres : si l'outil ne le dit pas, dis que tu ne sais pas.
"""

_TOOLS = [
    get_summary,
    list_issues,
    row_detail,
    explain_rule,
    get_column_pareto,
    get_duplicate_clusters,
]


class AuditClusterItem(BaseModel):
    id: str = Field(description="Identifiant unique court de la grappe, ex: r1_person_responsible")
    rule: str = Field(description="Règle violée : R1, R2 ou R3")
    title: str = Field(description="Titre clair en français, ex: Absence de Responsable")
    severity: str = Field(description="'blocking' si empêche la simulation Cockpit, sinon 'warning'")
    explanation: str = Field(description="Explication vulgarisée de la cause racine pour l'utilisateur")
    action: str = Field(description="Action recommandée")


class AutonomousAuditResult(BaseModel):
    headline: str = Field(description="Titre de synthèse court, ex: Prêt pour Cockpit ou 3 bloquants à corriger")
    verdict: str = Field(description="Résumé d'audit en 2-3 phrases sur l'impact simulation SAP")
    clusters: list[AuditClusterItem] = Field(default_factory=list, description="Grappes d'anomalies principales")
    priority_actions: list[str] = Field(default_factory=list, description="2-3 actions prioritaires")


def _build_model() -> Any:
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        api_key = (os.getenv("OPENAI_API_KEY") or "").strip().strip("\"'")
        return ChatOpenAI(model=os.getenv("MODEL") or "gpt-4o", api_key=api_key, temperature=0)
    from langchain_google_genai import ChatGoogleGenerativeAI

    api_key = (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip().strip("\"'")
    return ChatGoogleGenerativeAI(
        model=os.getenv("MODEL") or "gemini-2.5-flash",
        google_api_key=api_key,
        temperature=0,
    )


_graph = None


def get_graph():
    global _graph
    if _graph is None:
        _graph = create_react_agent(
            _build_model(), _TOOLS, prompt=SYSTEM_PROMPT,
            checkpointer=MemorySaver(),
        )
    return _graph


def run_autonomous_audit(session_id: str) -> dict:
    """Exécute l'agent auditeur autonome sur la session pour générer la synthèse
    de conformité SAP S/4HANA (headline, verdict, clusters de causes racines)."""
    try:
        summary = get_summary.invoke({"session_id": session_id})
        pareto = get_column_pareto.invoke({"session_id": session_id})
        duplicates = get_duplicate_clusters.invoke({"session_id": session_id})
        sample_issues = list_issues.invoke({"session_id": session_id, "limit": 15})

        model = _build_model()
        structured_llm = model.with_structured_output(AutonomousAuditResult)

        prompt = f"""Tu es l'auditeur qualité expert de migration de données vers SAP S/4HANA (Migration Cockpit).
Voici les métriques exactes récoltées par tes outils d'analyse sur le classeur :
- Synthèse : {summary}
- Pareto des colonnes à fort impact (Top rejets) : {pareto}
- Grappes de doublons de clés primaires R3 : {duplicates}
- Échantillon d'anomalies : {sample_issues}

Règles impératives de rédaction :
1. headline : Synthétique et percutant. Exemple : "Simulation Cockpit compromise — {summary.get('blocking', 0)} rejets bloquants" ou "Prêt pour injection Cockpit ({summary.get('valid', 0)}/{summary.get('total', 0)} conformes)".
2. verdict : 2 phrases MAXIMUM, ultra concrètes et chiffrées :
   - CITE obligatoirement les noms exacts des colonnes les plus fautives avec leur nombre d'erreurs (ex: "23 lignes bloquées par l'absence de 'Profit center group'").
   - CITE la clé exacte en conflit s'il y a des doublons (ex: "5 occurrences en doublon sur la clé 'PR desc 22'").
   - CITE les anomalies de rattachement inter-onglets s'il y en a.
   - INTERDICTION STRICTE : Ne formule AUCUNE généralité vague du type "Le classeur présente un nombre significatif d'anomalies" ou "Une correction approfondie est nécessaire". Sois direct, factuel et précis comme un auditeur SAP.
3. clusters : Regroupe les anomalies en grappes logiques de causes racines en expliquant clairement l'impact SAP (ex: rejet Cockpit BAPI, clé dupliquée dans le domaine de contrôle).
4. priority_actions : 2 ou 3 actions concrètes et ciblées (ex: "Renseigner 'Profit center group' sur les 23 lignes du Master Record")."""

        res: AutonomousAuditResult = structured_llm.invoke(prompt)
        return res.model_dump()
    except Exception as e:
        # Repli propre si indisponibilité du réseau ou quota
        return {
            "headline": "Audit qualité calculé.",
            "verdict": f"Analyse réalisée par le moteur d'audit (repli local : {e}).",
            "clusters": [],
            "priority_actions": ["Vérifiez les anomalies bloquantes dans le tableau."],
        }


def llm_configured() -> bool:
    provider = os.getenv("LLM_PROVIDER", "gemini").lower()
    if provider == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    return bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))


def provider_name() -> str:
    return os.getenv("LLM_PROVIDER", "gemini").lower()


def model_name() -> str:
    return os.getenv("MODEL") or (
        "gpt-4o" if provider_name() == "openai" else "gemini-2.5-flash"
    )

