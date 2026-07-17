# Agentic Code — Session Handoff (2026-07-16)

Temporary working notes for picking this back up next session. Not a design record — that's [ADR 0003](adr/0003-agentic-code-pipeline.md), which stays current and gets amended as decisions land. This file describes what happened in *this* session and what's still open, and should be treated as stale/replaceable once the next session produces a new one.

## Where things stand, in one paragraph

The Agentic Code tool has a complete frontend scaffold — a Claude-Code-style chat UI (single scrolling stream, resolved cards keep a badge instead of disappearing, one pinned auto-growing composer) — and now its **first real backend wire**: one endpoint, one local model (`gemma4:e4b-mlx`, downloaded and confirmed working), producing a real clarifying question and a real code snippet. No file writes, no plan generation, no permission gating, no session persistence yet — all deliberately deferred, one incremental slice at a time, per an explicit instruction from the user this session: *"I'll do it in steps."* Don't jump ahead of that pacing next session either — propose the next small slice and wait for agreement before building it.

## What got built this session

1. **UI reworked into a chat interface.** Was previously a stage-panel layout; is now a single message stream (user prompts, agent text, and plan/permission/batch/executor cards all rendered chronologically) with a bottom composer that contextually routes whatever's typed. Session switcher gained archive/delete via a "⋯" menu. The old always-visible "Flow Reference" block was removed (redundant with the About page, didn't fit the new layout).

2. **Project output location settled.** Every project lands at `agtdemo/dist/<project-name>/` — no folder picker. Intake asks for a name only if the user didn't already give one in their first message; the name becomes the session's display name in the sidebar. Documented in ADR 0003 and the About page.

3. **Model chosen and downloaded: `gemma4:e4b-mlx`.** Researched Gemma-family options specifically (user wanted a different model family than qwen2.5-coder, for learning). Key finding worth remembering: Gemma 4's 26B/31B variants score better on coding benchmarks but their Ollama file sizes (18–20GB) don't fit this machine's 16GB unified memory even though the 26B is MoE with only 3.8B *active* params — MoE memory footprint tracks *total* params, not active params, since all experts stay resident. E4B (8.8GB) fits comfortably and has native function-calling support (trained with dedicated tool-call tokens, not prompt-engineered), which is why it's viable as the eventual Coding Agent, not just a chat model. Confirmed via `ollama list` — downloaded and working.

4. **First real backend wire.** `POST /agentic-code/preview` (`backend/app/routers/agentic_code.py`) — two plain, one-shot calls to Ollama (no CrewAI, no SSE, no structured/JSON output — free text only, deliberately, to keep the first wire predictable). One call produces Intake's clarifying question, the other a representative code snippet. Frontend's `handleStart` in `AgenticCodeView.tsx` calls this for real; a new `"snippet"` chat-entry kind renders the result. Composer disables with a "Thinking…" placeholder while the call is in flight. Verified end-to-end in-browser with a real request — question and snippet were both genuinely relevant to the prompt, and the mocked flow picked back up seamlessly afterward (naming → planning → build → review → execute, still all mock).

5. **UI polish: message footer + thinking indicator.** Added `lucide-react` as a new dependency. Every `text`/`snippet` chat entry now has a Claude-Code-style footer: a copy button and a `"<duration>, <relative time> ago"` line (e.g. "1 minute and 19 seconds, just now"). A persistent Zap status badge sits left of the composer — amber/filled when idle, light-blue/spinning while a model call is in flight, with a brief opacity pulse on each transition; confirmed via `getComputedStyle` that stopping the spin snaps the icon back to upright rather than freezing mid-rotation.

## Verified this session (all in-browser, not just type-checked)

- Full mocked flow end-to-end: input → clarify → naming → plan (incl. targeted-revision loop) → per-file permission → batch review → all three executor output kinds → done.
- Session archive/delete, including the active-session-removed fallback logic.
- Real backend flow: typed request → real Ollama call → real question + real snippet rendered → flow continued into mock stages without a seam.
- Message footer timestamps and duration formatting on both live and seeded fixture data.
- Zap indicator through a real ~1–2 minute model call: correct color/spin during, correct instant reset after.
- No console errors, no server errors, `tsc --noEmit` clean throughout.

## Open questions — not resolved, don't assume an answer

- **Permission policy.** Currently maximally granular (one Allow/Deny prompt per file create/edit/delete, mirroring this environment's own trust model). The user explicitly flagged this to revisit once real agents/backend are being wired — that wiring is now underway, so this should come up soon. Not settled; don't build around either the current policy or a batched alternative without asking.
- **Duration attribution on the two real entries is uneven.** Because both Ollama calls happen inside one HTTP round-trip, the full latency (~1–2 min combined) shows on the question entry and the snippet shows "just now." Flagged to the user, not fixed. Fixing it cleanly would mean the backend reporting per-call timing, or splitting into two separate round-trips — a real design choice (also affects whether the UI should show incremental progress rather than one long silent wait), not a trivial patch.
- **What's the actual next backend slice?** Two candidates were named but neither was chosen: (a) real plan generation — harder than the two free-text calls done so far, since a plan needs structured output (task list + file ops) that a 4B-class model may not produce reliably; (b) a real file write gated by the permission UI that's already fully built. Ask before picking one.
- **Context-window budget** for `gemma4:e4b-mlx` specifically hasn't been measured or decided — ADR 0003 left this as an explicit open parameter pending model choice. Model is now chosen; the budget itself still isn't.
- **Session persistence** is still pure in-memory mock (resets on reload). Real persistence was scoped in ADR 0003 as "simple, JSON-to-disk, same pattern as `navigator_memory.py`" but not built.

## Key files

- `docs/adr/0003-agentic-code-pipeline.md` — the design record, kept current
- `frontend/src/components/AgenticCodeView.tsx` — the whole chat UI + mock state machine + the one real wire
- `frontend/src/components/AgenticCodeSessionSwitcher.tsx`, `AgenticCodeAbout.tsx`
- `frontend/src/lib/api.ts` — `previewAgenticCode()` (real) + the future event/action contract types (not yet wired)
- `backend/app/routers/agentic_code.py` — the one real endpoint
- `backend/app/config.py` — `AGENTIC_CODE_MODEL` (defaults to `gemma4:e4b-mlx`)
