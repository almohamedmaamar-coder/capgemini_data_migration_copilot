# Agent Qualité Profit Center (LangGraph + FastAPI)

## Lancer (Windows)

```bat
cd agent
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
REM renseigner GOOGLE_API_KEY dans .env (modèle : Gemini, non appelé sans clé)
uvicorn server:app --port 8001
```

## Endpoints

- `GET /health` → `{ status, llm_configured, provider, model }`
- `POST /analyze` (multipart `file`) → `{ session_id, report }` (détection + R1/R2/R3, sans LLM)
- `POST /chat` (`{ session_id, message }`) → `{ reply, actionFilter?, actionLabel? }` (requiert la clé LLM, sinon 503)

Le front Next.js (`NEXT_PUBLIC_AGENT_URL`, défaut `http://localhost:8000`) appelle
ces endpoints et rebascule sur le moteur local si le serveur est injoignable.
