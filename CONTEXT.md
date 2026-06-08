# Context: Multi-Agent Content Research & Creation Demo

## Glossary

### Pipeline
The sequential 4-agent CrewAI workflow that researches, filters, drafts, and edits an article for a given topic.

### Topic
A user-supplied string (max 200 chars) that drives the Pipeline. The subject the agents will research and write about.

### Agent
A CrewAI `Agent` instance with a specific persona and goal. Four agents exist: Researcher, Analyst, Writer, Editor.

### Task
A CrewAI `Task` bound to an Agent. Output of each Task is passed as context to the next.

### Demo Token
A signed JWT issued by the Admin endpoint. Self-contained: embeds expiry date and max-use count. No database. In-memory use counter (resets on backend restart — acceptable for demo).

### Admin Endpoint
A FastAPI route available on `localhost` only. Used to generate Demo Tokens. Not accessible on the deployed backend.

### Killswitch
An environment variable (`APP_KILLSWITCH`) checked at middleware level. When `true`, all routes return `503`. Activated by changing `.env` and redeploying.

### Rate Limit
Per-IP request throttle (5 req/hour) enforced at the FastAPI middleware layer.

### Daily Cap
A hard ceiling on total requests across all users per calendar day (50 req/day). Tracked in-memory server-side.
