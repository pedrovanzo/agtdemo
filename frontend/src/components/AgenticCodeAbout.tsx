"use client";

import Link from "next/link";

export function AgenticCodeAbout() {
  return (
    <div className="space-y-8 text-sm text-gray-700">

      {/* What is this */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">What is this?</h2>
        <p>
          A coding agent: describe what you want built, and a small pipeline of agents plans it,
          builds it file by file, and tells you how to run it. Unlike Research and Browser
          Navigator, this tool mutates your filesystem and can produce runnable code — so it leans
          on human checkpoints at every point that matters, instead of running end to end
          unsupervised.
        </p>
        <p>
          Initial scope is deliberately narrow: static or lightly-scripted frontend output
          (HTML/CSS/JS, optionally Tailwind or a JS library) and, at the top tier, a Next.js
          project. No backend code generation yet.
        </p>
      </section>

      {/* Scaffold status */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">Current status: mostly mock, one real wire</h2>
        <p>
          The very first exchange — Intake&apos;s clarifying question and a sample code snippet —
          is real: it calls <code className="bg-gray-100 px-1 rounded">gemma4:e4b-mlx</code> running
          locally via Ollama through a plain <code className="bg-gray-100 px-1 rounded">POST /agentic-code/preview</code>{" "}
          endpoint, no streaming or file writes yet. Everything after that (naming, planning,
          build, review, execute) still runs on <strong>local mock state and canned data</strong>.
          Sessions reset when you reload the page. See{" "}
          <code className="bg-gray-100 px-1 rounded">docs/adr/0003-agentic-code-pipeline.md</code>{" "}
          for the full design decision this scaffold follows.
        </p>
      </section>

      {/* The agents */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">The pipeline</h2>
        <div className="space-y-2">
          {[
            {
              name: "Intake Agent",
              desc: "Turns a raw chat request into clean, structured instructions. Asks a clarifying question when the request is ambiguous, instead of guessing — that's its whole reason for being a separate agent rather than a preprocessing step.",
            },
            {
              name: "Planner Agent",
              desc: "Drafts an execution plan divided into tasks. Owns persistent, project-scoped memory — conventions chosen, file structure, past decisions — that survives across sessions and cancellations. Rejected plans get a targeted revision, not a full redo.",
            },
            {
              name: "Coding Agent",
              desc: "Implements the approved plan one task at a time. Every file create, edit, or delete is its own permission prompt — maximally granular, the same trust model this environment uses.",
            },
            {
              name: "Executor",
              desc: "Not an LLM. A deterministic last step: opens plain HTML directly, lists paths for multi-page output, or prints the run command for framework output rather than executing it on your behalf.",
            },
          ].map((a) => (
            <div key={a.name} className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="font-semibold text-gray-800 text-sm mb-1">{a.name}</p>
              <p className="text-xs text-gray-600">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Gates */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Where you're asked to decide</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold">
              <tr>
                <th className="px-4 py-2 text-left">Gate</th>
                <th className="px-4 py-2 text-left">Options</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["Plan approval", "Approve → build. Reject with feedback → targeted re-plan. Cancel → back to input, project memory unaffected."],
                ["Per-file permission", "Allow or deny each file create/edit/delete individually, as the Coding Agent works through a task."],
                ["Code review per task", "Approve → next task or execution. Request changes → back to the Coding Agent with your feedback."],
                ["Result review", "You check the rendered/running output yourself. Not automated in this scope."],
              ].map(([gate, options]) => (
                <tr key={gate} className="text-gray-700">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">{gate}</td>
                  <td className="px-4 py-2 text-gray-600">{options}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sessions */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Sessions</h2>
        <p>
          A session is scoped to one project, and is meant to be resumable over time — similar to a
          Claude Code session. The Planner's memory is attached to the project, not the session, so
          it persists across cancellations and across separate sessions on the same project. In this
          scaffold, sessions are in-memory only and reset on reload; real persistence is plain
          structured data written to disk, the same pattern this app already uses for Browser
          Navigator's per-domain memory — it's simple, and it's staying in scope, just sequenced
          after a backend exists for this tool.
        </p>
      </section>

      {/* Project location */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Where output goes</h2>
        <p>
          Every project lands at a fixed path:{" "}
          <code className="bg-gray-100 px-1 rounded">agtdemo/dist/&lt;project-name&gt;/</code> — no
          per-run folder picker. If you don&apos;t name the project in your first message, Intake
          asks for one before planning starts. A session is scoped 1:1 to a project directory, so
          the project name also becomes the session&apos;s name in the sidebar.
        </p>
      </section>

      {/* Offline constraint */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Offline by hard constraint</h2>
        <p>
          This tool has no API-key inputs anywhere in its UI, on purpose. Every agent here must run
          on a locally-downloaded model — no OpenRouter, no cloud fallback. Which model is capable
          enough to plan and write code reliably on consumer hardware is still an open question;
          picking one is the immediate next step after this scaffold. See{" "}
          <Link href="/offline-ai" className="text-indigo-600 hover:underline">
            Offline AI
          </Link>{" "}
          for the memory math behind running a model like this entirely on-device.
        </p>
      </section>

    </div>
  );
}
