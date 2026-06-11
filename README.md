# Agentic AI Demo — Multi-Agent Content Pipeline

A hands-on demo for an Agentic AI course. Four specialized AI agents collaborate sequentially to research, filter, write, and edit an article on any topic you choose.

---

## Architecture

```
Browser (Next.js → Vercel)
        │
        │  POST /research  { topic }
        ▼
FastAPI Backend (Railway/Render)
        │
        ├── Killswitch middleware
        ├── Rate limit middleware (5 req/hour/IP, 50 req/day total)
        │
        └── CrewAI Pipeline  (one Crew per agent, chained sequentially)
              1. Researcher  → searches web via Serper API
              2. Analyst     → filters & ranks findings
              3. Writer      → drafts the article
              4. Editor      → polishes final output
```

**Why two services?** CrewAI is Python-only. Next.js is Node. FastAPI bridges them.

**Why one Crew per agent?** Each agent runs its own `Crew.kickoff()` and streams results back to the UI as it finishes. This lets the frontend show each agent's output in real time rather than waiting for the full pipeline to complete.

---

## Agents

| # | Agent | Role | Tools |
|---|-------|------|-------|
| 1 | Researcher | Lead Topic Researcher | Serper API (web search) |
| 2 | Analyst | Data Analyst & Quality Controller | LLM reasoning only |
| 3 | Writer | Technical Writer & Journalist | LLM reasoning only |
| 4 | Editor | Senior Copyeditor | LLM reasoning only |

Each agent's output becomes the next agent's input — this is the core of a sequential multi-agent pipeline.

---

## LLM Model

The default model is `google/gemma-4-31b-it:free` via OpenRouter, configured in `backend/.env`:

```
OPENROUTER_MODEL=google/gemma-4-31b-it:free
```

To switch models, replace this value with any model ID from [openrouter.ai/models](https://openrouter.ai/models). Each agent has a `max_tokens=1024` budget — a good starting point for demos. Reasoning-heavy agents (Writer, Editor) may benefit from a higher limit or a more capable model when you move beyond the demo stage.

---

## Setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Mac/Linux
# .venv\Scripts\activate    # Windows

pip install -r requirements.txt

cp .env.example .env
# Fill in your keys in .env
```

Run locally:
```bash
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install

cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000 for local dev
```

Run locally:
```bash
npm run dev
```

---

## Security Controls

| Control | Config |
|---------|--------|
| Rate limit | `RATE_LIMIT_PER_HOUR` in `.env` (default: 5/hour/IP) |
| Daily cap | `DAILY_REQUEST_CAP` in `.env` (default: 50/day) |
| Killswitch | Set `APP_KILLSWITCH=true` in `.env` + redeploy |
| Input sanitization | Topic: max 200 chars, alphanumeric + basic punctuation |
| Credentials | Users can supply their own API keys via the UI; server `.env` keys are the fallback |

---

## Deployment

**Frontend → Vercel**
- Root directory: `frontend`
- Set `NEXT_PUBLIC_API_URL` to your Railway/Render backend URL

**Backend → Railway or Render**
- Root directory: `backend`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Add all `.env` variables in the platform's environment settings
