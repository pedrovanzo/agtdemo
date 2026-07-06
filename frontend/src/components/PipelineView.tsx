"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { AgentCard } from "./AgentCard";
import { streamResearch, checkCredentials, PipelineEvent, CredentialsStatus } from "@/lib/api";
import { QueryHelper } from "./QueryHelper";
import { About } from "./About";

const AGENTS = [
  { key: "Researcher", name: "Researcher", role: "Lead Topic Researcher" },
  { key: "Analyst", name: "Analyst", role: "Data Analyst & Quality Controller" },
  { key: "Writer", name: "Writer", role: "Technical Writer & Journalist" },
  { key: "Editor", name: "Editor", role: "Senior Copyeditor" },
];

type AgentStatus = "idle" | "active" | "done";
type LogEntry = { type: "log" | "result" | "error"; message: string };

export function PipelineView() {
  const [topic, setTopic] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({
    Researcher: "idle", Analyst: "idle", Writer: "idle", Editor: "idle",
  });
  const [agentLogs, setAgentLogs] = useState<Record<string, LogEntry[]>>({
    Researcher: [], Analyst: [], Writer: [], Editor: [],
  });
  const [selectedTab, setSelectedTab] = useState<string>("Researcher");
  const [hasStarted, setHasStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const activeAgentRef = useRef<string>("Researcher");

  // Credentials state
  const [showCreds, setShowCreds] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [userOpenRouter, setUserOpenRouter] = useState("");
  const [userSerper, setUserSerper] = useState("");
  const [backendCreds, setBackendCreds] = useState<CredentialsStatus | null>(null);

  useEffect(() => {
    checkCredentials().then(setBackendCreds);
  }, []);

  const currentLogsLength = agentLogs[selectedTab]?.length ?? 0;
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentLogsLength, selectedTab]);

  function pushLog(agent: string, entry: LogEntry) {
    setAgentLogs((prev) => ({
      ...prev,
      [agent]: [...(prev[agent] ?? []), entry],
    }));
  }

  async function handleRun(costSafe: boolean) {
    const effectiveOpenRouter = userOpenRouter.trim() || (backendCreds?.openrouter ?? false);
    const effectiveSerper = userSerper.trim() || (backendCreds?.serper ?? false);

    if (!effectiveOpenRouter || !effectiveSerper) {
      const missing = [];
      if (!effectiveOpenRouter) missing.push("OpenRouter API key");
      if (!effectiveSerper) missing.push("Serper API key");
      window.alert(`Missing credentials: ${missing.join(", ")}.\n\nUse the "Use my own credentials" panel to provide them.`);
      setShowCreds(true);
      return;
    }

    setAgentLogs({ Researcher: [], Analyst: [], Writer: [], Editor: [] });
    setStatuses({ Researcher: "idle", Analyst: "idle", Writer: "idle", Editor: "idle" });
    setSelectedTab("Researcher");
    activeAgentRef.current = "Researcher";
    setHasStarted(true);
    setRunning(true);

    const credentials = {
      ...(userOpenRouter.trim() && { openrouter_api_key: userOpenRouter.trim() }),
      ...(userSerper.trim() && { serper_api_key: userSerper.trim() }),
    };

    try {
      await streamResearch(topic, credentials, costSafe, (event: PipelineEvent) => {
        if (event.type === "agent_start") {
          activeAgentRef.current = event.agent;
          setStatuses((prev) => ({ ...prev, [event.agent]: "active" }));
          setSelectedTab(event.agent);
        } else if (event.type === "agent_done") {
          setStatuses((prev) => ({ ...prev, [event.agent]: "done" }));
        } else if (event.type === "log") {
          pushLog(event.agent, { type: "log", message: event.message });
        } else if (event.type === "agent_result") {
          pushLog(event.agent, { type: "result", message: `Result:\n${event.data}` });
        } else if (event.type === "error") {
          pushLog(activeAgentRef.current, { type: "error", message: `❌ ${event.message}` });
          setStatuses((prev) => {
            const next = { ...prev };
            for (const k of Object.keys(next)) {
              if (next[k] === "active") next[k] = "idle";
            }
            return next;
          });
        }
      });
    } catch {
      // connection-level errors are already surfaced via the event callback
    } finally {
      setRunning(false);
    }
  }

  const currentLogs = agentLogs[selectedTab] ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Multi-Agent Research Pipeline</h1>
          <p className="mt-1 text-gray-500">
            {showAbout
              ? "How it works, what each agent does, and every constraint explained."
              : "Enter a topic and watch each agent work in sequence."}
          </p>
        </div>
        <Link
          href="/"
          className="flex-shrink-0 text-sm text-gray-400 hover:text-indigo-600 transition-colors"
        >
          ← All tools
        </Link>
      </div>

      {showAbout ? (
        <>
          <button
            type="button"
            onClick={() => setShowAbout(false)}
            className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
          >
            ← back
          </button>
          <About />
        </>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); handleRun(false); }}>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

              {/* Input row */}
              <div className="flex items-center gap-2 px-3 py-2.5">
                <input
                  type="text"
                  placeholder="Enter a research topic — e.g. 'What is WebAssembly?'"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  maxLength={200}
                  required
                  disabled={running}
                  className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowHelper(true)}
                  title="Query writing tips"
                  className="flex-shrink-0 text-xs text-gray-400 hover:text-blue-600 transition-colors px-1"
                >
                  ? tips
                </button>
              </div>

              {/* Credentials expansion */}
              {showCreds && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      OpenRouter API Key
                      {backendCreds?.openrouter && <span className="ml-2 text-green-600">(server default available)</span>}
                    </label>
                    <input
                      type="password"
                      placeholder={backendCreds?.openrouter ? "Leave blank to use server default" : "sk-or-..."}
                      value={userOpenRouter}
                      onChange={(e) => setUserOpenRouter(e.target.value)}
                      disabled={running}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Serper API Key
                      {backendCreds?.serper && <span className="ml-2 text-green-600">(server default available)</span>}
                    </label>
                    <input
                      type="password"
                      placeholder={backendCreds?.serper ? "Leave blank to use server default" : "xxxxxxxx..."}
                      value={userSerper}
                      onChange={(e) => setUserSerper(e.target.value)}
                      disabled={running}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
                    />
                  </div>
                </div>
              )}

              {/* Action bar */}
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAbout((v) => !v)}
                    className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    {showAbout ? "← back" : "about"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreds(!showCreds)}
                    className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {showCreds ? "▲ hide credentials" : "▼ credentials"}
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={running || !topic.trim()}
                    onClick={() => handleRun(true)}
                    className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40 transition-colors"
                  >
                    Cost-safe Research
                  </button>
                  <button
                    type="submit"
                    disabled={running || !topic.trim()}
                    className="rounded-lg bg-blue-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {running ? "Running…" : "Start Research"}
                  </button>
                </div>
              </div>

            </div>
          </form>

          {/* Agent cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {AGENTS.map((a) => (
              <AgentCard
                key={a.key}
                name={a.name}
                role={a.role}
                status={statuses[a.key]}
                selected={selectedTab === a.key}
                onClick={() => setSelectedTab(a.key)}
              />
            ))}
          </div>

          {showHelper && (
            <QueryHelper
              onSelect={(query) => setTopic(query)}
              onClose={() => setShowHelper(false)}
            />
          )}

          {/* Terminal log box */}
          <div className="rounded-lg border border-gray-300 bg-gray-900 p-4 font-mono text-sm text-green-400 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">{selectedTab} Logs</span>
              <span className="text-xs text-gray-600">Click a card to switch agent view</span>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {currentLogs.length === 0 ? (
                <div className="text-gray-500">
                  {hasStarted ? `No activity yet for ${selectedTab}.` : "Waiting for input..."}
                </div>
              ) : (
                currentLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={
                      log.type === "error"
                        ? "text-red-400"
                        : log.type === "result"
                          ? "whitespace-pre-wrap text-yellow-400"
                          : "text-green-400"
                    }
                  >
                    {log.message}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
