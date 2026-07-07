"use client";

import Link from "next/link";

export function About() {
  return (
    <div className="space-y-8 text-sm text-gray-700">

      {/* What is this */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">What is this?</h2>
        <p>
          A multi-agent AI content pipeline built as a hands-on demo for an Agentic AI course.
          Enter a topic and four specialized AI agents collaborate — each one receives the previous
          agent's output as its input — to produce a researched, filtered, written, and edited article.
        </p>
        <p>
          The goal is to make the agent handoff process visible in real time: each agent's activity
          streams to its own log tab as it runs, so you can follow exactly what each one does with
          what it receives.
        </p>
      </section>

      {/* Pipeline */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">How the pipeline works</h2>
        <p>
          Each agent runs as its own isolated CrewAI <code className="bg-gray-100 px-1 rounded">Crew</code> instance.
          When one finishes, its output is injected into the next agent's task description and a new
          Crew is started. This keeps each agent's execution independent while still chaining their outputs.
        </p>
        <p>
          Results stream back to the browser via Server-Sent Events (SSE). The backend sends
          structured events (<code className="bg-gray-100 px-1 rounded">agent_start</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">log</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">agent_result</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">agent_done</code>) so the UI can animate
          cards and route each log line to the correct agent tab in real time.
        </p>
      </section>

      {/* Agents */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-gray-900">The agents</h2>

        {[
          {
            num: "1",
            name: "Researcher",
            role: "Lead Topic Researcher",
            tool: "Serper API (live web search)",
            receives: "Your topic",
            produces: "3–5 bullet points of raw facts gathered from the web",
            note: "The only agent that touches the internet. Runs real search queries via Serper and pulls the top results.",
          },
          {
            num: "2",
            name: "Analyst",
            role: "Data Analyst & Quality Controller",
            tool: "LLM reasoning only",
            receives: "Researcher's raw findings",
            produces: "A filtered, ranked list of verified facts",
            note: "Removes duplicates, flags questionable claims, and surfaces the most relevant information for the writer.",
          },
          {
            num: "3",
            name: "Writer",
            role: "Technical Writer & Journalist",
            tool: "LLM reasoning only",
            receives: "Analyst's curated findings",
            produces: "A short article draft (3–4 paragraphs)",
            note: "Structures the facts into a readable narrative with a title, intro, body, and conclusion. No new facts are added.",
          },
          {
            num: "4",
            name: "Editor",
            role: "Senior Copyeditor",
            tool: "LLM reasoning only",
            receives: "Writer's draft",
            produces: "Polished final article",
            note: "Fixes grammar, improves flow, and cuts repetition. Does not introduce new information — only refines what's there.",
          },
        ].map((a) => (
          <div key={a.num} className="rounded-lg border border-gray-200 p-4 space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold text-gray-400">{a.num}</span>
              <span className="font-bold text-gray-900">{a.name}</span>
              <span className="text-xs text-gray-400">{a.role}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="font-semibold text-gray-500 mb-0.5">Tool</p>
                <p>{a.tool}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-500 mb-0.5">Receives</p>
                <p>{a.receives}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-500 mb-0.5">Produces</p>
                <p>{a.produces}</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 italic">{a.note}</p>
          </div>
        ))}
      </section>

      {/* Features */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Features</h2>

        {[
          {
            label: "Per-agent log tabs",
            desc: "Click any agent card to view that agent's individual log output. The active agent's tab is selected automatically as the pipeline runs. After a run you can click back through any card to review its work.",
          },
          {
            label: "Cost-safe mode",
            desc: "The free OpenRouter tier allows 16 LLM requests per minute. With 4 agents each making multiple internal calls, this limit can be hit mid-pipeline. \"Cost-safe Research\" adds a 10-second pause before each agent starts (Analyst, Writer, Editor) to spread requests across the rate-limit window.",
          },
          {
            label: "Own credentials panel",
            desc: "If no server-side API keys are configured, expand \"Use my own credentials\" to supply your OpenRouter and Serper keys. User-supplied keys take priority over any server defaults. Keys are sent in the request body and never stored.",
          },
          {
            label: "Query helper",
            desc: "The \"? Tips\" button opens a guide explaining how to write cost-efficient topics. Narrow, factual topics produce better results with fewer tokens — important when running on a 1024-token budget per agent.",
          },
        ].map((f) => (
          <div key={f.label} className="rounded-lg border border-gray-200 p-3">
            <p className="font-semibold text-gray-800 mb-1">{f.label}</p>
            <p className="text-gray-600">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Constraints */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Constraints & limits</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold">
              <tr>
                <th className="px-4 py-2 text-left">Constraint</th>
                <th className="px-4 py-2 text-left">Value</th>
                <th className="px-4 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ["Token budget per agent", "1,024 tokens", "Demo cost control — keeps each run under a few cents"],
                ["Free model rate limit", "16 req / min", "OpenRouter's hard cap on free-tier models"],
                ["Topic max length", "200 characters", "Input sanitization — prevents prompt injection via long strings"],
                ["Allowed characters", "Letters, numbers, spaces, basic punctuation", "Safe character whitelist on the backend"],
                ["OpenRouter free daily cap", "50 LLM calls / day (OpenRouter account)", "OpenRouter's own hard limit on free-tier model usage — resets at midnight UTC. Separate from the app's own cap below."],
                ["App rate limit", "5 pipeline runs / hour / IP", "Backend middleware — blocks the request before it reaches CrewAI"],
                ["App daily cap", "50 pipeline runs / day total", "Backend middleware ceiling across all users — distinct from OpenRouter's 50-call limit above"],
                ["Killswitch", "Set APP_KILLSWITCH=true in server .env", "Instantly disables all pipeline runs without redeployment"],
                ["LLM model", "google/gemma-4-31b-it:free (default)", "Configurable via OPENROUTER_MODEL in server .env"],
              ].map(([constraint, value, reason]) => (
                <tr key={constraint} className="text-gray-700">
                  <td className="px-4 py-2 font-medium">{constraint}</td>
                  <td className="px-4 py-2 font-mono text-gray-600">{value}</td>
                  <td className="px-4 py-2 text-gray-500">{reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stack */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">Tech stack</h2>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
          {[
            ["Frontend", "Next.js 14, Tailwind CSS"],
            ["Backend", "FastAPI (Python)"],
            ["Agent framework", "CrewAI 1.14.6"],
            ["LLM gateway", "OpenRouter"],
            ["Web search", "Serper API"],
            ["Streaming", "Server-Sent Events (SSE)"],
          ].map(([layer, value]) => (
            <div key={layer} className="rounded-lg border border-gray-200 px-3 py-2">
              <p className="font-semibold text-gray-500">{layer}</p>
              <p className="text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Related */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">Related</h2>
        <Link
          href="/offline-ai"
          className="group block rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
        >
          <p className="font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors">
            Offline AI →
          </p>
          <p className="text-gray-600 mt-0.5">
            The memory math behind running a 7B-parameter model entirely locally via
            Ollama — no API keys, no cloud, no cost.
          </p>
        </Link>
      </section>

    </div>
  );
}
