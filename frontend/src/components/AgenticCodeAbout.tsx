"use client";

import Link from "next/link";

export function AgenticCodeAbout() {
  return (
    <div className="space-y-8 text-sm text-gray-700">

      {/* What is this */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">What is this?</h2>
        <p>
          A coding agent: describe what you want built, and it produces one real,
          self-contained HTML page — styled with Tailwind CSS and Font Awesome icons via
          CDN — with human checkpoints before anything gets written and before it's
          considered done. Unlike Research and Browser Navigator, this tool mutates your
          filesystem, so every step that matters is gated on your approval rather than
          running end to end unsupervised.
        </p>
        <p>
          Scope is deliberately narrow: one static HTML file per project, no multi-page
          sites, no framework output, no backend code. See{" "}
          <code className="bg-gray-100 px-1 rounded">docs/adr/0003-agentic-code-pipeline.md</code>{" "}
          for why — the original design sketched a multi-task Planner and multi-file
          output, but on a small local model that produced plans disconnected from the
          actual request and pages that lost their styling partway through a multi-pass
          build. Single-file-per-request is what's reliable on this hardware today.
        </p>
      </section>

      {/* Status */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">Current status: fully real, no mocked stages</h2>
        <p>
          Every step in the pipeline is a genuine call to{" "}
          <code className="bg-gray-100 px-1 rounded">gemma4:e4b-mlx</code> running locally via
          Ollama, or a real filesystem operation: Intake&apos;s clarifying question, the
          project folder creation, the file generation, and every revision from feedback.
          Nothing here is canned or pre-scripted. Sessions are still in-memory only and
          reset on reload — real cross-session persistence remains sequenced future work.
        </p>
      </section>

      {/* The agents */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">The pipeline</h2>
        <div className="space-y-2">
          {[
            {
              name: "Intake Agent",
              desc: "Turns a raw chat request into a real project. Asks one clarifying question about content, style, or tone — never about output format, since that's fixed to a single HTML page — then creates the real numbered project folder.",
            },
            {
              name: "Coding Agent",
              desc: "Generates the one file for real, grounded in your actual request text (not a template). Automatically retries once if the required Tailwind CDN tag goes missing from its own output, and flags it in review if it's still missing after that — a real, cheap correctness check, not a mock.",
            },
            {
              name: "Executor",
              desc: "Not an LLM. A deterministic last step: prints the generated file's path for you to open manually.",
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
                ["Permission", "Allow → the Coding Agent writes the file for real. Deny → nothing is written, back to input."],
                ["Review", "Approve → done, Executor lists the path. Request changes → your feedback goes straight into the next real generation call."],
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

      {/* Project location */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Where output goes</h2>
        <p>
          Every project lands at{" "}
          <code className="bg-gray-100 px-1 rounded">agtdemo/dist/&lt;n&gt;-&lt;name&gt;/</code>,
          where <code className="bg-gray-100 px-1 rounded">n</code> is a real, ever-incrementing
          counter across every project this tool has ever built — no per-run folder picker, no
          collisions. If you don&apos;t name the project in your first message, Intake asks for
          one before building starts. A session is scoped 1:1 to a project directory, so the
          resolved folder name also becomes the session&apos;s name in the sidebar.
        </p>
      </section>

      {/* Offline constraint */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Offline by hard constraint</h2>
        <p>
          This tool has no API-key inputs anywhere in its UI, on purpose. Every agent here runs
          on a locally-downloaded model — no OpenRouter, no cloud fallback. See{" "}
          <Link href="/offline-ai" className="text-indigo-600 hover:underline">
            Offline AI
          </Link>{" "}
          for the memory math behind running a model like this entirely on-device.
        </p>
      </section>

    </div>
  );
}
