"use client";

import Link from "next/link";

export function NavigatorAbout() {
  return (
    <div className="space-y-8 text-sm text-gray-700">

      {/* What is this */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">What is this?</h2>
        <p>
          A single-agent browser automation pipeline built as a hands-on demo for an Agentic AI course.
          Provide a company IR page URL, and the agent opens a real browser, finds the most recent
          Financial Statements PDF in the results table, and downloads it — no human clicks required.
        </p>
        <p>
          The key agentic insight here is <strong>tool use over reasoning</strong>: instead of asking the
          LLM to interpret table structure and decide which row to click, we give it one deterministic tool
          that handles all the DOM extraction internally. The LLM&apos;s only job is to call that tool with
          the right URL.
        </p>
      </section>

      {/* How Ollama fits in */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Running 100% locally with Ollama</h2>
        <p>
          This tool uses <strong>no paid APIs</strong>. The LLM that drives the agent is{" "}
          <code className="bg-gray-100 px-1 rounded">qwen2.5:7b</code>, running locally via{" "}
          <strong>Ollama</strong>.
        </p>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-2 text-xs">
          <p className="font-semibold text-gray-600 uppercase tracking-wide">How the call chain works</p>
          <ol className="list-decimal list-inside space-y-1 text-gray-700">
            <li>
              The frontend sends a POST to <code className="bg-gray-100 px-1 rounded">/navigate</code> with the IR URL
            </li>
            <li>
              FastAPI starts a background thread with a CrewAI <code className="bg-gray-100 px-1 rounded">Crew</code>
            </li>
            <li>
              CrewAI calls LiteLLM with model <code className="bg-gray-100 px-1 rounded">ollama/qwen2.5:7b</code>
            </li>
            <li>
              LiteLLM forwards the request to <code className="bg-gray-100 px-1 rounded">http://localhost:11435</code> — Ollama&apos;s local API (non-default port; 11434 was occupied)
            </li>
            <li>
              Qwen decides to call the <code className="bg-gray-100 px-1 rounded">download_financial_statement</code> tool
            </li>
            <li>
              The tool runs Playwright + httpx and returns the result. The LLM is done.
            </li>
          </ol>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs">
          <p className="font-semibold text-gray-600 uppercase tracking-wide mb-1">Start Ollama</p>
          <pre className="bg-gray-900 text-green-400 rounded p-3 text-xs overflow-x-auto">OLLAMA_HOST=127.0.0.1:11435 ollama serve</pre>
          <p className="mt-2 text-gray-500">
            Port 11435 is used because 11434 (the default) was already occupied. To avoid typing this
            every time, add <code className="bg-gray-100 px-1 rounded">export OLLAMA_HOST=127.0.0.1:11435</code> to your <code className="bg-gray-100 px-1 rounded">~/.zshrc</code>.
          </p>
        </div>
        <p>
          Because the model runs on-device, latency depends on your hardware. On an M-series Mac, expect
          roughly 5–15 seconds for the LLM decision step. The browser navigation itself adds another
          10–30 seconds depending on the site.
        </p>
      </section>

      {/* The agent */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">The Pilot agent</h2>
        <p>
          There is one agent: <strong>Pilot</strong>. It has one tool. Its task description is
          intentionally minimal — any extra instructions caused the model to enter "analysis mode"
          instead of immediately calling the tool.
        </p>
        <div className="rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-semibold text-gray-500 mb-1">Role</p>
              <p>Document Downloader</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 mb-1">LLM</p>
              <p>qwen2.5:7b via Ollama (local)</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 mb-1">Max iterations</p>
              <p>2 — tool call + return result</p>
            </div>
            <div>
              <p className="font-semibold text-gray-500 mb-1">Delegation</p>
              <p>Disabled</p>
            </div>
          </div>
          <div className="text-xs">
            <p className="font-semibold text-gray-500 mb-1">Task description (verbatim)</p>
            <pre className="bg-gray-900 text-green-400 rounded p-3 text-xs overflow-x-auto whitespace-pre-wrap">
{`Call download_financial_statement with this URL: {ir_url}
The tool will navigate, find the most recent Financial Statements PDF,
and save it to: {download_folder}
Return the result from the tool exactly as-is.`}
            </pre>
          </div>
        </div>
      </section>

      {/* The tool */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">What the tool actually does</h2>
        <p>
          <code className="bg-gray-100 px-1 rounded">DownloadFinancialStatementTool</code> does all the
          heavy lifting without any LLM involvement:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-sm pl-1">
          <li>
            <strong>Navigate</strong> to the given IR URL using a Playwright headless Chrome session, waiting
            for <code className="bg-gray-100 px-1 rounded">networkidle</code>.
          </li>
          <li>
            <strong>Find the Results Center</strong> — if no table is found on the landing page, the tool
            scans all <code className="bg-gray-100 px-1 rounded">&lt;a&gt;</code> tags for text containing
            &ldquo;result&rdquo;, &ldquo;resultado&rdquo;, or &ldquo;quarterly&rdquo; and navigates there.
          </li>
          <li>
            <strong>DOM extraction</strong> — a JavaScript snippet injected via{" "}
            <code className="bg-gray-100 px-1 rounded">page.evaluate()</code> scans every table header
            for &ldquo;FINANCIAL&rdquo;, &ldquo;ITR&rdquo;, or &ldquo;DFP&rdquo;. Once the column index
            is found, it returns the first active <code className="bg-gray-100 px-1 rounded">&lt;a href&gt;</code>{" "}
            in that column — which is the most recent row because the table is sorted newest-first in the DOM.
          </li>
          <li>
            <strong>Download via httpx</strong> — rather than using Playwright&apos;s download API (which
            caused 404 redirects), the tool copies the browser session cookies and fetches the PDF directly
            with an <code className="bg-gray-100 px-1 rounded">httpx</code> client, then writes the bytes
            to disk.
          </li>
        </ol>
      </section>

      {/* Iteration story */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">How many iterations it took — and why</h2>
        <p>
          This tool went through <strong>10+ major redesigns</strong> before it reliably downloaded the
          correct file. The failure modes were instructive:
        </p>
        <div className="space-y-2">
          {[
            {
              label: "Wrong document type",
              desc: "The agent downloaded the Earnings Release (press release) instead of the official Financial Statements (ITR). Fixed by making the tool look specifically for the 'FINANCIAL STATEMENTS' column header, not any PDF link.",
            },
            {
              label: "Wrong year (2024 instead of 2026)",
              desc: "Prompt-level year filtering ('download the 2026 file') was ignored or misapplied by the LLM. Fixed by removing year reasoning from the LLM entirely — the DOM extraction now picks the first row, which is the newest.",
            },
            {
              label: "Always downloading 2019",
              desc: "The results table on Localiza's IR page is sorted oldest→newest. slice(0,3) returned the first three rows — all from 2019. Switching to slice(-3) (last three) fixed it, and then removing the slice entirely in favor of 'first link in column' was cleaner.",
            },
            {
              label: "Downloaded a 404.html file",
              desc: "Playwright's download interception followed a redirect to an error page and used that URL. Switching to httpx with the original URL and browser cookies bypassed the redirect issue entirely.",
            },
            {
              label: "Agent got stuck browsing",
              desc: "When given too many instructions, qwen2.5:7b would reason about pages instead of calling the tool. The task description was stripped down to four lines. max_iter=2 enforces a hard stop.",
            },
            {
              label: "llama3.1:8b described tool calls instead of making them",
              desc: "Tested with a larger model thinking it would reason better. It did not — it described what the tool would do rather than invoking it. Reverted to qwen2.5:7b which reliably executes tool calls.",
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-gray-200 px-4 py-3">
              <p className="font-semibold text-gray-800 text-xs mb-0.5">{item.label}</p>
              <p className="text-xs text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 italic">
          Key lesson: changing the prompt and the browser tool at the same time made it impossible to
          isolate what caused a regression. Later iterations only changed one thing at a time.
        </p>
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
                ["Ollama required", "Must be running at localhost:11435", "Start with: OLLAMA_HOST=127.0.0.1:11435 ollama serve — or add that export to ~/.zshrc to avoid typing it every time"],
                ["Model", "qwen2.5:7b", "Reliably executes tool calls; llama3.1:8b described them instead of calling them"],
                ["Browser engine", "Chromium (headless)", "Playwright default; handles JS-rendered pages"],
                ["Navigation timeout", "30 s per page load", "Prevents hanging on slow or broken targets"],
                ["Download method", "httpx with browser cookies", "Playwright's download API followed redirects to error pages"],
                ["App rate limit", "5 runs / hour / IP", "Backend middleware shared with Research Pipeline"],
                ["Killswitch", "APP_KILLSWITCH=true in .env", "Disables all runs without redeployment"],
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
            ["Agent framework", "CrewAI 1.14"],
            ["LLM", "qwen2.5:7b via Ollama (free, local)"],
            ["LLM bridge", "LiteLLM (built into CrewAI)"],
            ["Browser automation", "Playwright (headless Chrome)"],
            ["File download", "httpx"],
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
