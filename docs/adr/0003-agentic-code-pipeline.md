# ADR 0003: Agentic Code — Two-Stage Pipeline with Human Gates

## Status
Accepted, then revised in place — see **Revamp (2026-07-19)** below. The original multi-task Planner design in this document is kept as the historical record of the initial decision; the revamp section documents what changed, why, and what the pipeline actually does today. Read both: the Decision section below still states the long-term shape this tool is aiming at, the revamp section states the deliberately-narrowed shape it runs as right now.

## Context
The next tool in this demo is a coding agent: describe what you want built, and agents plan it, build it, and run it. Unlike Research and Browser Navigator, this tool mutates the filesystem and can execute arbitrary generated code, so it needs stronger human checkpoints than a fire-and-forget pipeline. It also has a hard constraint the other tools don't: it must run on **100% offline, locally-downloaded models** — no OpenRouter, no API keys in the UI. Model selection itself is out of scope for this ADR; it's the immediate next step after scaffolding.

Initial output scope is deliberately narrow: static or lightly-scripted frontend code (HTML/CSS/JS, optionally Tailwind or a JS library) and, at the top tier, a Next.js project. No backend code generation in v1.

## Decision

### Agents
Three LLM agents plus one deterministic step:

1. **Intake Agent** — turns a raw chat request into clean, structured instructions. Can ask clarifying questions back to the user when the request is ambiguous, rather than guessing and handing off. This is its distinguishing job, not just text cleanup.
2. **Planner Agent** (project manager) — turns clean instructions into an execution plan divided into tasks. Owns **persistent, project-scoped memory** (conventions chosen, file structure, past decisions) that survives across sessions. On a rejected plan, revises via a **targeted diff against the existing plan**, not a full regeneration — feedback on task 3 shouldn't reshuffle tasks 1 and 2.
3. **Coding Agent** — implements the approved plan task by task. Permission is batched per task: one Allow/Deny prompt covers all file creates/edits/deletes in that task's batch, not one prompt per file. (Revised from an earlier maximally-granular per-file design once real backend wiring made the prompt volume concrete.)
4. **Executor** (non-LLM, deterministic) — after the final code review is approved: lists generated file paths in chat for the user to open manually (single HTML file or multiple pages, same treatment); prints the run command (e.g. `npm run dev`) for framework-based output instead of executing it on the user's behalf. Earlier revisions had a UI button claiming to open plain HTML directly in a browser — it never actually did, so it was dropped rather than implemented; opening output is always manual now.

### Human gates
- **Plan approval** — approve → build; reject with feedback → targeted re-plan; cancel → discard the current task and return to input (project memory is unaffected).
- **Per-task permission** — each task's batch of file operations is allowed/denied as one unit.
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
- Batched per-task permission means fewer prompts during a build than per-file granularity would produce, at the cost of coarser control if only one file in a task's batch is objectionable.
- Model choice, real backend persistence, and disk-state reconciliation on session resume (what happens if files changed outside the tool between sessions) are explicitly deferred and not solved by this ADR.

## Revamp (2026-07-19)

### Why
By the time a real backend existed for Intake + file writes, the **Planner Agent was still fully mocked** — `buildMockPlan()` in the frontend always returned one of two hardcoded canned plans (a fixed "portfolio site: hero + grid + contact" template) keyed only on output format, never on the actual request text. This surfaced as a real, reproduced bug: a request for "a simple hero section" produced an attempt at a full multi-section landing page, because the plan was never connected to the request in the first place. Compounding it, each of the mock plan's 2-3 tasks triggered a **full-file rewrite** of the same HTML file (diff-based editing was implemented and tested, but disabled — see `_DIFF_MODE_ENABLED` in `backend/app/routers/agentic_code.py` — after failing to apply cleanly on 2/2 real attempts against this model, costing more time on failure than skipping it). Multiple full-document rewrites per request meant multiple chances for a pass to drop the Tailwind CDN `<script>` tag — the harnesses forbid any other styling mechanism — silently shipping a page with every class="" present but zero actual styling.

Root cause in both cases: the tool was pretending to plan multi-file work it wasn't actually planning, and re-rolling the entire document multiple times per request on a model too small to do either reliably.

### What changed
- **The Planner Agent and the plan-approval gate are dropped.** No multi-task decomposition. One request → one real generation call for one self-contained `index.html` (Tailwind + Font Awesome via CDN, inline `<script>`), grounded directly in the real request text — the same generation pipeline already proven working, just no longer sitting behind a fake planning step.
- **Two human gates instead of four**, which is actually a closer match to this document's own framing above ("two evaluation moments") than the four-gate build it replaces: **permission** (pre-write: allow/deny creating the file) and **review** (post-write: approve, or give feedback that feeds directly into the next real generation call — no separate "plan revision" concept needed since there's no plan).
- **A real correctness check, not a mock**: after generation, the backend verifies the Tailwind CDN tag is actually present in the output; if it's missing, one automatic retry with a corrective instruction; if still missing, the review step surfaces an explicit warning instead of silently shipping an unstyled page. See `_generate_full_file` / `_TAILWIND_CDN_MARKER` in `backend/app/routers/agentic_code.py`.
- **Intake's clarifying question no longer asks about output format** (single HTML vs. multi-page vs. framework) since that choice no longer exists — it now asks about content, style, or tone specifics instead, which is a better fit for its stated job of resolving genuine ambiguity.
- Multi-file output and the Next.js/framework tier are out of scope for now, not abandoned — this document's original Decision section above (multi-task Planner, per-task batching, framework Executor branch) is the target shape to grow back into once a real Planner can be made reliable on-model, not a design that was wrong, just premature given current model constraints and timeline.

### What stayed the same
Intake's real clarifying-question call, real numbered project-folder creation (`dist/<n>-<name>/`), the real per-file generation + harness system, the real feedback-threading loop, and the Executor's honest "list the path, open manually" behavior are all unchanged — this revamp is almost entirely *subtraction* of the fake middle stage, not new plumbing.

### Explicitly still deferred
Persistent cross-session Planner memory, targeted-diff plan revision, context-window budget tuning beyond the `num_ctx`/`num_predict` values already set, real backend session persistence, and disk-state reconciliation on resume all remain future work, same as before this revamp — none of it was solved and none of it needed to be solved to fix the bug that triggered this revamp.
