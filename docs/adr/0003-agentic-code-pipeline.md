# ADR 0003: Agentic Code — Two-Stage Pipeline with Human Gates

## Status
Accepted. Frontend scaffold complete. First real backend wire landed: `POST /agentic-code/preview` (`backend/app/routers/agentic_code.py`) makes two plain, one-shot calls to a local `gemma4:e4b-mlx` model via Ollama — one for the Intake clarifying question, one for a sample code snippet — and the frontend's `handleStart` now uses this for real instead of a mock. Everything after that first exchange (naming, planning, build, review, execute) is still mocked; the session-based streaming architecture described below is not yet built.

## Context
The next tool in this demo is a coding agent: describe what you want built, and agents plan it, build it, and run it. Unlike Research and Browser Navigator, this tool mutates the filesystem and can execute arbitrary generated code, so it needs stronger human checkpoints than a fire-and-forget pipeline. It also has a hard constraint the other tools don't: it must run on **100% offline, locally-downloaded models** — no OpenRouter, no API keys in the UI. Model selection itself is out of scope for this ADR; it's the immediate next step after scaffolding.

Initial output scope is deliberately narrow: static or lightly-scripted frontend code (HTML/CSS/JS, optionally Tailwind or a JS library) and, at the top tier, a Next.js project. No backend code generation in v1.

## Decision

### Agents
Three LLM agents plus one deterministic step:

1. **Intake Agent** — turns a raw chat request into clean, structured instructions. Can ask clarifying questions back to the user when the request is ambiguous, rather than guessing and handing off. This is its distinguishing job, not just text cleanup.
2. **Planner Agent** (project manager) — turns clean instructions into an execution plan divided into tasks. Owns **persistent, project-scoped memory** (conventions chosen, file structure, past decisions) that survives across sessions. On a rejected plan, revises via a **targeted diff against the existing plan**, not a full regeneration — feedback on task 3 shouldn't reshuffle tasks 1 and 2.
3. **Coding Agent** — implements the approved plan task by task. Every file create/edit/delete is a separate permission prompt (maximally granular — mirrors Claude Code's own tool-permission UX, not batched per task).
4. **Executor** (non-LLM, deterministic) — after the final code review is approved: opens plain HTML directly in a browser; lists file paths in chat for the user to open manually when multiple pages are involved; prints the run command (e.g. `npm run dev`) for framework-based output instead of executing it on the user's behalf.

### Human gates
- **Plan approval** — approve → build; reject with feedback → targeted re-plan; cancel → discard the current task and return to input (project memory is unaffected).
- **Per-file permission** — every file operation during build is allowed/denied individually.
- **Code review per task-batch** — after each batch of files that composes one task: approve → next batch or execution; request changes (free text) → back to the Coding Agent with that feedback.
- **Post-execution review** — the user checks the rendered/running result manually. Not automated in this scope, though the existing Browser Navigator's vision agent is a plausible future extension for this step.

This gives two "evaluation" moments (pre-execution code review, post-execution result review), corresponding to the two moments in the original design sketch.

### Sessions
A session is scoped to one project (one target output directory) and is resumable over time, similar to a Claude Code session. Planner memory is attached to the project and persists across sessions and across cancellations — only the in-flight task is discarded on cancel, not the project's accumulated memory. Session storage (chat log, plan versions, permission decisions) is plain structured data written to disk — the same pattern as the existing per-domain memory store in `backend/app/memory/navigator_memory.py` — not a new capability class. It is real, in-scope future work, not dropped; it is simply sequenced after a backend exists for this tool.

### Context window handling
Persistent sessions accumulate history that can't all be re-fed to a model on every call, especially given local models typically have smaller context windows than hosted ones. The principle: **disk storage is full and unbounded; prompt injection is bounded and curated.** Only a compact running summary (in the same spirit as `navigator_memory.py`'s `format_for_agent` hint compaction) plus the current task's immediate context gets injected into any agent call — never the raw full history. The exact token budget is model-dependent and left as an explicit open parameter until a specific offline model is chosen.

### Project location
Every project the tool builds lands at a fixed, predictable path: **`agtdemo/dist/<project-name>/`** — no per-run folder picker. The project name is requested from the user if not already given in their initial request (Intake Agent asks, mirroring its existing clarifying-question behavior); if the user already named it, the tool skips asking. A session is scoped 1:1 to a project directory, so the project name also becomes the session's display name in the session switcher.

## Consequences
- No API-key inputs anywhere in this tool's UI; the homepage card states the offline-only constraint explicitly, unlike Research (OpenRouter/Serper) and Browser Navigator (Ollama already, but optional cloud fallback historically discussed).
- The existing one-shot `POST → SSE stream` pattern used by Research and Browser Navigator does not fit this tool, because it needs mid-stream human input (plan approval, per-file permission, batch review). The eventual backend will need a session-based design (start a session, stream agent events, accept out-of-band user actions against that session) rather than a single fire-and-collect call.
- Maximal per-file permission granularity means more prompts during a build than a batched alternative would produce; accepted as the safer, more Claude-Code-consistent default.
- Model choice, real backend persistence, and disk-state reconciliation on session resume (what happens if files changed outside the tool between sessions) are explicitly deferred and not solved by this ADR.
