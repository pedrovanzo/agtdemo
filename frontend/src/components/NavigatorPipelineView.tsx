"use client";

import { useState, useRef, useEffect } from "react";
import { AgentCard } from "./AgentCard";
import { streamNavigate, NavigatorEvent } from "@/lib/api";
import { NavigatorAbout } from "./NavigatorAbout";

const AGENTS = [
  { key: "Pilot", name: "Pilot", role: "Vision Navigator" },
];

type AgentStatus = "idle" | "active" | "done";
type LogEntry = { type: "log" | "result" | "error"; message: string };

const INITIAL_STATUSES: Record<string, AgentStatus> = {
  Pilot: "idle",
};
const INITIAL_LOGS: Record<string, LogEntry[]> = {
  Pilot: [],
};

export function NavigatorPipelineView() {
  const [company, setCompany]               = useState("Localiza");
  const [url, setUrl]                       = useState("https://ri.localiza.com/en/");
  const [fileQuery, setFileQuery]           = useState("Find the latest quarterly financial statement (ITR) PDF and download it");
  const [downloadFolder, setDownloadFolder] = useState("~/Downloads");

  useEffect(() => {
    const isWindows = navigator.userAgent.toLowerCase().includes("win");
    setDownloadFolder(isWindows ? "C:\\Users\\Public\\Downloads" : "~/Downloads");
  }, []);

  const [statuses, setStatuses]       = useState<Record<string, AgentStatus>>(INITIAL_STATUSES);
  const [agentLogs, setAgentLogs]     = useState<Record<string, LogEntry[]>>(INITIAL_LOGS);
  const [selectedTab, setSelectedTab] = useState<string>("Pilot");
  const [hasStarted, setHasStarted]   = useState(false);
  const [running, setRunning]         = useState(false);
  const [showAbout, setShowAbout]     = useState(false);

  const logsEndRef     = useRef<HTMLDivElement>(null);
  const activeAgentRef = useRef<string>("Pilot");
  const abortRef       = useRef<AbortController | null>(null);

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

  function handleStop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setStatuses((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k] === "active") next[k] = "idle";
      }
      return next;
    });
    pushLog(activeAgentRef.current, { type: "error", message: "⏹ Run stopped by user." });
  }

  async function handleRun() {
    setAgentLogs({ ...INITIAL_LOGS });
    setStatuses({ ...INITIAL_STATUSES });
    setSelectedTab("Pilot");
    activeAgentRef.current = "Pilot";
    setHasStarted(true);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamNavigate(
        {
          company: company.trim(),
          url: url.trim(),
          file_query: fileQuery.trim(),
          download_folder: downloadFolder.trim(),
        },
        (event: NavigatorEvent) => {
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
        },
        controller.signal,
      );
    } catch {
      // connection-level errors surfaced via event callback
    } finally {
      abortRef.current = null;
      setRunning(false);
    }
  }

  const formValid = company.trim() && fileQuery.trim() && downloadFolder.trim();
  const currentLogs = agentLogs[selectedTab] ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Multi-Agent Browser Navigator</h1>
        <p className="mt-1 text-gray-500">
          {showAbout
            ? "How it works, what each agent does, and every constraint explained."
            : "Name a company, describe the document — a vision agent navigates the web and downloads it."}
        </p>
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
          <NavigatorAbout />
        </>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); handleRun(); }}>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">

              {/* Input fields */}
              <div className="divide-y divide-gray-100">
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-28 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Company
                  </span>
                  <input
                    type="text"
                    placeholder="e.g. Localiza, Petrobras, Vale"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    required
                    disabled={running}
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-28 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    IR URL
                    <span className="ml-1 font-normal normal-case text-gray-300">(opt)</span>
                  </span>
                  <input
                    type="url"
                    placeholder="https://ri.company.com/en/ — leave blank to search"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={running}
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-28 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Find
                  </span>
                  <input
                    type="text"
                    placeholder="Latest annual results report PDF"
                    value={fileQuery}
                    onChange={(e) => setFileQuery(e.target.value)}
                    maxLength={300}
                    required
                    disabled={running}
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-28 flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Save to
                  </span>
                  <input
                    type="text"
                    placeholder="/Users/you/Downloads"
                    value={downloadFolder}
                    onChange={(e) => setDownloadFolder(e.target.value)}
                    required
                    disabled={running}
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Action bar */}
              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowAbout((v) => !v)}
                  className="text-xs text-gray-400 hover:text-blue-600 transition-colors"
                >
                  about
                </button>
                <div className="flex items-center gap-2">
                  {running && (
                    <button
                      type="button"
                      onClick={handleStop}
                      className="rounded-lg bg-red-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-600 transition-colors"
                    >
                      Stop
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={running || !formValid}
                    className="rounded-lg bg-blue-600 px-5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {running ? "Running…" : "Start Navigation"}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Agent cards */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* Terminal log box */}
          <div className="rounded-lg border border-gray-300 bg-gray-900 p-4 font-mono text-sm text-green-400 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">{selectedTab} Logs</span>
              <span className="text-xs text-gray-600">Click a card to switch view</span>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1">
              {currentLogs.length === 0 ? (
                <div className="text-gray-500">
                  {hasStarted
                    ? `No activity yet for ${selectedTab}.`
                    : "Waiting for input…"}
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
