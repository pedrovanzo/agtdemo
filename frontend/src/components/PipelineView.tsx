"use client";

import { useState, useRef, useEffect } from "react";
import { AgentCard } from "./AgentCard";
import { streamResearch, PipelineEvent } from "@/lib/api";

const AGENTS = [
  { key: "Researcher", name: "Researcher", role: "Lead Topic Researcher" },
  { key: "Analyst", name: "Analyst", role: "Data Analyst & Quality Controller" },
  { key: "Writer", name: "Writer", role: "Technical Writer & Journalist" },
  { key: "Editor", name: "Editor", role: "Senior Copyeditor" },
];

type AgentStatus = "idle" | "active" | "done";

export function PipelineView() {
  const [topic, setTopic] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({
    Researcher: "idle",
    Analyst: "idle",
    Writer: "idle",
    Editor: "idle",
  });
  const [logs, setLogs] = useState<Array<{ type: string; message: string }>>([]);
  const [running, setRunning] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLogs([]);
    setRunning(true);
    setStatuses({ Researcher: "active", Analyst: "idle", Writer: "idle", Editor: "idle" });

    try {
      await streamResearch(topic, (event: PipelineEvent) => {
        if (event.type === "log") {
          setLogs((prev) => [...prev, { type: "log", message: event.message }]);
        } else if (event.type === "result") {
          setLogs((prev) => [...prev, { type: "result", message: `📄 Result:\n${event.data}` }]);
          setStatuses({ Researcher: "done", Analyst: "idle", Writer: "idle", Editor: "idle" });
        } else if (event.type === "error") {
          setLogs((prev) => [...prev, { type: "error", message: `❌ ${event.message}` }]);
          setStatuses({ Researcher: "idle", Analyst: "idle", Writer: "idle", Editor: "idle" });
        }
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Unexpected error";
      setLogs((prev) => [...prev, { type: "error", message: `❌ ${errorMsg}` }]);
      setStatuses({ Researcher: "idle", Analyst: "idle", Writer: "idle", Editor: "idle" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Multi-Agent Research Pipeline</h1>
        <p className="mt-1 text-gray-500">Enter a topic and watch the researcher agent work in real time.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          placeholder="Research topic (e.g. 'Quantum computing in 2025')"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={200}
          required
          disabled={running}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={running || !topic.trim()}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {running ? "Running pipeline…" : "Start Research"}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {AGENTS.map((a) => (
          <AgentCard key={a.key} name={a.name} role={a.role} status={statuses[a.key]} />
        ))}
      </div>

      {/* Terminal-like log box */}
      <div className="rounded-lg border border-gray-300 bg-gray-900 p-4 font-mono text-sm text-green-400 shadow-md">
        <div className="mb-2 text-xs text-gray-400">Connection Log</div>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-500">Waiting for input...</div>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={`${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "result"
                      ? "text-yellow-400"
                      : "text-green-400"
                }`}
              >
                {log.message}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}
