# ADR 0001: Next.js + FastAPI Split Stack

## Status
Accepted

## Context
CrewAI is Python-only. A front-end is needed for a polished, Vercel-deployable demo. Options were Streamlit (single Python deploy) or Next.js + FastAPI (split stack).

## Decision
Next.js (frontend) + FastAPI (backend). Next.js deploys to Vercel. FastAPI deploys to Railway/Render.

## Consequences
Two deployment targets from one GitHub repo (`/frontend` and `/backend`). Next.js communicates with FastAPI via `NEXT_PUBLIC_API_URL` env var. Slightly more setup but produces a polished, production-shaped demo that serves better as a teaching artifact.

Streamlit was rejected: insufficient UI control and poor separation of concerns for instructional purposes.
