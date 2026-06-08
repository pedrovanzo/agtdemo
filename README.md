# Agentic AI Demo — Multi-Agent Content Pipeline

A hands-on demo for an Agentic AI course. Four specialized AI agents collaborate sequentially to research, filter, write, and edit an article on any topic you choose.

---

## Architecture

```
Browser (Next.js → Vercel)
        │
        │  POST /research  { topic, token }
        ▼
FastAPI Backend (Railway/Render)
        │
        ├── Killswitch middleware
        ├── Rate limit middleware (5 req/hour/IP, 50 req/day total)
        ├── Token auth middleware (JWT)
        │
        └── CrewAI Pipeline
              1. Researcher  → searches web via Serper API
              2. Analyst     → filters & ranks findings
              3. Writer      → drafts the article
              4. Editor      → polishes final output
```

**Why two services?** CrewAI is Python-only. Next.js is Node. FastAPI bridges them.

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

## Setup

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Mac/Linux

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

## Generating a Demo Token

With the backend running locally:

```
GET http://localhost:8000/admin/generate-token?label=john_doe&uses=10&days=7
```

This endpoint is **localhost-only** — it cannot be called from the deployed backend.

Share the returned token with your contact via LinkedIn DM. They paste it into the app's token field to access the demo.

---

## Security Controls

| Control | Config |
|---------|--------|
| Demo token (JWT) | Generated via admin endpoint |
| Rate limit | `RATE_LIMIT_PER_HOUR` in `.env` (default: 5/hour/IP) |
| Daily cap | `DAILY_REQUEST_CAP` in `.env` (default: 50/day) |
| Killswitch | Set `APP_KILLSWITCH=true` in `.env` + redeploy |
| Input sanitization | Topic: max 200 chars, alphanumeric + basic punctuation |

---

## Deployment

**Frontend → Vercel**
- Root directory: `frontend`
- Set `NEXT_PUBLIC_API_URL` to your Railway/Render backend URL

**Backend → Railway or Render**
- Root directory: `backend`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Add all `.env` variables in the platform's environment settings
