# Capgemini Data Migration Copilot 🚀

> **Copilote d'Audit & de Qualification Qualité pour SAP S/4HANA Migration Cockpit**  
> Propulsé par Next.js 15, LangGraph & Gemini 2.5 Flash.

---

## 🌟 Présentation

Le **Capgemini Data Migration Copilot** est une plateforme d'audit autonome conçue pour sécuriser et accélérer la migration de données vers **SAP S/4HANA** via le Migration Cockpit.

Il combine un **moteur de règles déterministe ultra-rapide** (vérification de complétude R1, cohérence inter-onglets R2, détection de doublons de clés primaires R3) et un **agent de raisonnement autonome LangGraph (Gemini 2.5 Flash)** capable d'évaluer le risque de rejet en simulation SAP, de regrouper les anomalies par causes racines et de guider les consultants data dans leur démarche de remédiation.

---

## ✨ Fonctionnalités Clés

1. **Détection Intelligente de Structure Excel** :
   - Détection automatique de la ligne d'en-tête (même en présence de titres/métadonnées SAP).
   - Identification automatique de la clé primaire et des champs obligatoires marqués d'un astérisque (`*`).
   - Modale de revue et confirmation personnalisable avant lancement de l'audit.

2. **Audit Autonome & Simulation Cockpit** :
   - Moteur ReAct LangGraph avec 6 outils d'audit dédiés (`get_summary`, `get_column_pareto`, `get_duplicate_clusters`, `list_issues`, `row_detail`, `explain_rule`).
   - Télémétrie d'intégrité en temps réel et diagramme de Pareto des colonnes critiques.
   - Regroupement des anomalies par grappes de causes racines métier.

3. **Expérience Utilisateur Innovante & Triage Avancé** :
   - **Cell X-Ray** : mise en évidence contextuelle des anomalies directement dans la grille de données.
   - **Navigation Clavier** : bascule rapide entre lignes en erreur via `J` (suivant) et `K` (précédent).
   - **Filtres 1-clic** : Bloquants R1, Incohérences R2, Doublons R3.
   - **Spotlight Ligne Active** : audit chirurgical instantané au clic sur n'importe quelle ligne.
   - **Plan de Remédiation Interactif** : check-list des actions de correction avec suivi de progression.

4. **Copilote Conversationnel avec Mémoire de Session** :
   - Assistant d'audit interactif contextuel avec suggestions de questions dynamiques.
   - Explications adaptées aux règles de gestion financière et logistique SAP S/4HANA.

---

## 🏗️ Architecture

```
migration-copilot/
├── app/                    # Application Next.js 15 (App Router)
├── components/             # Composants React / Tailwind CSS
│   ├── AuditClusters.tsx   # Grappes de causes racines
│   ├── AuditTelemetry.tsx  # Jauge Cockpit & Pareto des rejets
│   ├── ChatSidebar.tsx     # Hub de triage, Chat IA & Plan de remédiation
│   ├── DataTable.tsx       # Grille de données avec Cell X-Ray & navigation
│   ├── DetectionBreakdown.tsx # Modale de confirmation de structure
│   ├── RowDrawer.tsx       # Tiroir de détail & comparateur de doublons
│   └── Verdict.tsx         # Synthèse exécutive de simulation
├── lib/                    # Logique métier & state management
│   ├── local-analyzer.ts   # Moteur d'audit déterministe TS
│   ├── workbook-detect.ts  # Analyseur heuristique de structure Excel
│   └── store.ts            # Store Zustand unifié
├── agent/                  # Backend Agent Autonome (Python)
│   ├── server.py           # API FastAPI (Port 8001)
│   ├── graph.py            # LangGraph ReAct Agent (Gemini 2.5 Flash)
│   ├── tools.py            # Outils déterministes exposés à l'agent
│   ├── engine.py           # Moteur d'audit binaire Python
│   └── .env.example        # Modèle de configuration
└── types/                  # Schémas TypeScript
```

---

## 🚀 Démarrage Rapide

### 1. Prérequis
- **Node.js** >= 18.17.0
- **Python** >= 3.10
- Une clé d'API Google Gemini (`GOOGLE_API_KEY`)

### 2. Installation du Frontend (Next.js)

```bash
npm install
npm run dev
```
L'interface est accessible sur [http://localhost:3000](http://localhost:3000).

### 3. Démarrage du Backend Agent (FastAPI / LangGraph)

```bash
cd agent
python -m venv .venv
# Sur Windows :
.venv\Scripts\activate
# Sur Linux/macOS :
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Renseignez votre GOOGLE_API_KEY dans agent/.env

python server.py
```
Le serveur agent démarre sur [http://localhost:8001](http://localhost:8001).

---

## 🛡️ Règles d'Audit Supportées

* **R1 (Obligatoires)** : Détection des cellules vides ou non renseignées sur les champs obligatoires (`*`). Rejet bloquant immédiat dans le Cockpit SAP.
* **R2 (Cohérence Inter-feuilles)** : Validation des liaisons entre onglets (ex: rattachement d'un centre de profit à une société dans `Company Code Assignment`).
* **R3 (Doublons)** : Unicité stricte des clés primaires sur le périmètre de l'entité migratoire.

---

## 📄 Licence

Propriété Capgemini — Tous droits réservés.
