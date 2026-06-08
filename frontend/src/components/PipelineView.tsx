"use client";

import { useState } from "react";
import { AgentCard } from "./AgentCard";
import { streamResearch, PipelineEvent } from "@/lib/api";
import ReactMarkdown from "react-markdown";

const AGENTS = [
  { key: "Researcher", name: "Researcher", role: "Lead Topic Researcher" },
  { key: "Analyst", name: "Analyst", role: "Data Analyst & Quality Controller" },
  { key: "Writer", name: "Writer", role: "Technical Writer & Journalist" },
  { key: "Editor", name: "Editor", role: "Senior Copyeditor" },
];

type AgentStatus = "idle" | "active" | "done";

export function PipelineView() {
  const [topic, setTopic] = useState("");
  const [token, setToken] = useState("");
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({
    Researcher: "idle",
    Analyst: "idle",
    Writer: "idle",
    Editor: "idle",
  });
  const [article, setArticle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function setAgent(key: string, status: AgentStatus) {
    setStatuses((prev) => ({ ...prev, [key]: status }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setArticle(null);
    setRunning(true);
    setStatuses({ Researcher: "active", Analyst: "idle", Writer: "idle", Editor: "idle" });

    try {
      await streamResearch(topic, token, (event: PipelineEvent) => {
        if (event.event === "start") {
          // Mark previous agent done, new one active
          const idx = AGENTS.findIndex((a) => a.key === event.agent);
          setStatuses((prev) => {
            const next = { ...prev };
            if (idx > 0) next[AGENTS[idx - 1].key] = "done";
            next[event.agent] = "active";
            return next;
          });
        } else if (event.event === "complete") {
          setStatuses({ Researcher: "done", Analyst: "done", Writer: "done", Editor: "done" });
          setArticle(event.article);
        }
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error.");
      setStatuses({ Researcher: "idle", Analyst: "idle", Writer: "idle", Editor: "idle" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Multi-Agent Research Pipeline</h1>
        <p className="mt-1 text-gray-500">Enter a topic and watch four AI agents collaborate in real time.</p>
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
        <input
          type="password"
          placeholder="Demo access token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          disabled={running}
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={running || !topic.trim() || !token.trim()}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {running ? "Running pipeline…" : "Run Pipeline"}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {AGENTS.map((a) => (
          <AgentCard key={a.key} name={a.name} role={a.role} status={statuses[a.key]} />
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {article && (
        <div className="prose prose-sm max-w-none rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <ReactMarkdown>{article}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
