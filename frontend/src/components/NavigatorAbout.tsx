"use client";

export function NavigatorAbout() {
  return (
    <div className="space-y-8 text-sm text-gray-700">

      {/* What is this */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">What is this?</h2>
        <p>
          A multi-agent browser automation pipeline built as a hands-on demo for an Agentic AI course.
          Provide a starting URL, describe the file you want, and three specialized agents collaborate
          to open a real browser, locate the document, and download it to your chosen folder — no
          human clicks required.
        </p>
        <p>
          The goal is to show autonomous web navigation as an agentic pattern: agents that perceive
          a live page, reason about its structure, and take action through a real browser rather than
          a search API.
        </p>
      </section>

      {/* Pipeline */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-gray-900">How the pipeline works</h2>
        <p>
          Each agent runs as its own isolated CrewAI <code className="bg-gray-100 px-1 rounded">Crew</code> instance
          equipped with Playwright browser tools. When one agent finishes, its output — a resolved URL or
          a located file link — is injected into the next agent&apos;s task description and a new Crew is
          started.
        </p>
        <p>
          Results stream back to the browser via Server-Sent Events (SSE), exactly as in the Research
          Pipeline. The UI receives structured events (<code className="bg-gray-100 px-1 rounded">agent_start</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">log</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">agent_result</code>,{" "}
          <code className="bg-gray-100 px-1 rounded">agent_done</code>) so each agent&apos;s browser
          activity appears in its own log tab in real time.
        </p>
      </section>

      {/* Agents */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-gray-900">The agents</h2>

        {[
          {
            num: "1",
            name: "Navigator",
            role: "Browser Operator",
            tool: "Playwright (headless Chrome)",
            receives: "Your starting URL",
            produces: "The resolved URL of the target section (e.g. Investor Relations page)",
            note: "Opens a real browser, loads the starting URL, and traverses the site structure to reach the section most likely to contain the requested document. Handles redirects, cookie banners, and JS-rendered menus.",
          },
          {
            num: "2",
            name: "Scout",
            role: "Document Locator",
            tool: "Playwright + LLM reasoning",
            receives: "Navigator's resolved section URL",
            produces: "The direct download URL of the best-matching document",
            note: "Scans the target page for downloadable files (PDF, XLSX, etc.), reads link text and surrounding context, and uses LLM reasoning to rank candidates against your file description. Returns the single best match.",
          },
          {
            num: "3",
            name: "Downloader",
            role: "File Retriever",
            tool: "Playwright + filesystem",
            receives: "Scout's direct download URL",
            produces: "The downloaded file saved to your designated folder",
            note: "Fetches the file via the browser session (preserving any auth cookies from prior navigation), writes it to your specified folder, and confirms the file name and size.",
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

      {/* Memory */}
      <section className="space-y-4">
        <h2 className="text-base font-bold text-gray-900">Agentic memory</h2>
        <p>
          The pipeline uses two types of memory that work together to make agents smarter
          over time and reduce unnecessary LLM calls.
        </p>

        {[
          {
            tag: "Short-term",
            color: "bg-blue-50 border-blue-200 text-blue-800",
            badge: "bg-blue-100 text-blue-700",
            title: "Context passing — Navigator → Scout",
            description:
              "After Navigator finishes, its full output (what it saw, what it decided, where it landed) " +
              "is injected directly into Scout's task description. Scout doesn't re-discover what Navigator " +
              "already found — it starts with that knowledge as working context. This is equivalent to " +
              "CrewAI's context=[nav_task] parameter, implemented manually to preserve per-agent SSE streaming.",
            scope: "Within a single pipeline run. Discarded when the run ends.",
          },
          {
            tag: "Long-term",
            color: "bg-violet-50 border-violet-200 text-violet-800",
            badge: "bg-violet-100 text-violet-700",
            title: "Navigation path memory — persists across runs",
            description:
              "After a successful run, the pipeline saves the navigation paths that worked: the URL of the " +
              "'Information to Shareholders' page, the URL of 'Results Center', and the last PDF found. " +
              "On the next run for the same site domain, these paths are injected as hints into both agents' " +
              "task descriptions. The agents still verify the pages exist and reason normally — memory is a " +
              "starting hint, not a hardcoded shortcut. This typically cuts LLM calls from ~10 to ~2.",
            scope: "Stored in memory_store.json in the backend. Persists between server restarts.",
          },
        ].map((m) => (
          <div key={m.tag} className={`rounded-lg border p-4 space-y-2 ${m.color}`}>
            <div className="flex items-baseline gap-2">
              <span className={`text-xs font-bold rounded px-1.5 py-0.5 ${m.badge}`}>{m.tag}</span>
              <span className="font-semibold text-sm">{m.title}</span>
            </div>
            <p className="text-sm">{m.description}</p>
            <p className="text-xs opacity-70">Scope: {m.scope}</p>
          </div>
        ))}

        <p className="text-sm text-gray-500">
          The <strong>Memory card</strong> in the pipeline view logs every memory interaction in real time:
          what was recalled at the start, what context was passed between agents, and what was saved at the end.
        </p>
      </section>

      {/* Why 3 agents */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-gray-900">Why split into 3 agents?</h2>
        <p>
          Each agent maps to one of the three inputs: the URL (Navigator), the file description (Scout),
          and the download folder (Downloader). This separation keeps each agent&apos;s responsibility
          narrow and its failure mode isolated — if Scout can&apos;t find the document, Navigator and
          Downloader don&apos;t need to re-run.
        </p>
        <p>
          It also makes the reasoning step visible: Scout is the only agent that uses LLM judgment.
          Navigator and Downloader are deterministic browser operations. Splitting them lets you see
          exactly where the AI decision happens versus where pure automation runs.
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
                ["Inputs", "URL + file description + folder", "All three required — no defaults, agent has no prior knowledge of the target"],
                ["Browser engine", "Chromium (headless)", "Playwright default; covers >95% of public web apps"],
                ["Navigation timeout", "30 seconds per page load", "Prevents hanging on slow or broken targets"],
                ["File types supported", "PDF, XLSX, DOCX, ZIP (initial scope)", "Scout ranks by extension match against common report formats"],
                ["Download folder", "Must be an absolute path the server can write to", "Backend validates path existence before starting the pipeline"],
                ["App rate limit", "5 runs / hour / IP", "Same backend middleware as the Research Pipeline"],
                ["Killswitch", "Set APP_KILLSWITCH=true in server .env", "Instantly disables all runs without redeployment"],
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
            ["Agent framework", "CrewAI"],
            ["Browser automation", "Playwright"],
            ["LLM (Scout only)", "OpenRouter"],
            ["Streaming", "Server-Sent Events (SSE)"],
          ].map(([layer, value]) => (
            <div key={layer} className="rounded-lg border border-gray-200 px-3 py-2">
              <p className="font-semibold text-gray-500">{layer}</p>
              <p className="text-gray-800">{value}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
