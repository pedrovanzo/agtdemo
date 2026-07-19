"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Check, Copy, Zap } from "lucide-react";
import {
  AgenticCodeFileOp,
  AgenticCodeStage,
  createAgenticCodeProject,
  streamAgenticCodePreview,
  streamWriteTask,
} from "@/lib/api";
import { AgenticCodeAbout } from "./AgenticCodeAbout";
import { AgenticCodeSessionSwitcher, AgenticCodeSessionSummary } from "./AgenticCodeSessionSwitcher";

// Single-file-per-project MVP (see ADR 0003's revamp section). No mocked
// stage — Intake's question, project creation, the file write, and the
// feedback loop are all real calls to the local model / real disk writes.

type PermissionResolution = "pending" | "allowed" | "denied";
type BatchResolution = "pending" | "approved" | "changes_requested";
type ExecutorResolution = "pending" | "done";

type ChatEntry = { id: string; createdAt: number } & (
  | { kind: "user"; text: string }
  | { kind: "text"; agent: string; text: string }
  | { kind: "permission"; agent: string; taskTitle: string; ops: AgenticCodeFileOp[]; resolution: PermissionResolution }
  | { kind: "batch"; agent: string; taskTitle: string; ops: AgenticCodeFileOp[]; resolution: BatchResolution }
  | { kind: "executor"; agent: string; paths: string[]; resolution: ExecutorResolution }
);

type SessionState = {
  stage: AgenticCodeStage;
  entries: ChatEntry[];
  pendingEntryId: string | null;
  fileOp: AgenticCodeFileOp | null;
  composerText: string;
  feedbackTarget: "batch" | null;
  projectName: string | null;
  requestText: string | null;
  pendingFeedback: string | null;
  awaitingModel: boolean;
  modelWorkStartedAt: number | null;
};

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `e${idSeq}`;
}

function makeEntry<T extends object>(fields: T, createdAt: number = Date.now()): T & { id: string; createdAt: number } {
  return { ...fields, id: nextId(), createdAt };
}

function freshSession(): SessionState {
  return {
    stage: "input",
    entries: [],
    pendingEntryId: null,
    fileOp: null,
    composerText: "",
    feedbackTarget: null,
    projectName: null,
    requestText: null,
    pendingFeedback: null,
    awaitingModel: false,
    modelWorkStartedAt: null,
  };
}

// All Agentic Code output lands under this directory — see ADR 0003.
const PROJECT_ROOT = "agtdemo/dist";

function projectPath(name: string) {
  return `${PROJECT_ROOT}/${name}`;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Mock stand-in for "the user already told us the project name" detection —
// a real Intake Agent would do this with an LLM call, not a regex.
function extractProjectName(text: string): string | null {
  const patterns = [
    /call(?:ed)? it ["']?([a-zA-Z0-9 _-]+?)["']?[.,!]?$/i,
    /name(?:d)? (?:it |this )?["']?([a-zA-Z0-9 _-]+?)["']?[.,!]?$/i,
    /project (?:name|called) ["']?([a-zA-Z0-9 _-]+?)["']?[.,!]?$/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const slug = slugify(m[1]);
      if (slug) return slug;
    }
  }
  return null;
}

const INITIAL_SESSION_META: AgenticCodeSessionSummary[] = [
  { id: "s-current", name: "New session", lastActive: "now", status: "idle", archived: false },
];

function createInitialSessions(): Record<string, SessionState> {
  return { "s-current": freshSession() };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  if (seconds === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} and ${seconds} second${seconds === 1 ? "" : "s"}`;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec} second${diffSec === 1 ? "" : "s"} ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

// Claude-Code-style footer under a response: copy + how long it took + when.
// Duration is measured as the gap since the previous entry in the stream —
// accurate for real model calls (the previous entry marks when the request
// started), near-zero for synchronous mock steps (so it's omitted below 1s).
function MessageFooter({ copyText, createdAt, previousCreatedAt }: { copyText: string; createdAt: number; previousCreatedAt: number | null }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard
      .writeText(copyText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  const durationMs = previousCreatedAt !== null ? createdAt - previousCreatedAt : null;
  const parts: string[] = [];
  if (durationMs !== null && durationMs >= 1000) parts.push(formatDuration(durationMs));
  parts.push(formatRelativeTime(createdAt));

  return (
    <div className="mt-1 flex items-center gap-2 px-1">
      <button
        type="button"
        onClick={handleCopy}
        className="text-gray-300 hover:text-gray-600 transition-colors"
        title="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <span className="text-[10px] text-gray-400">{parts.join(", ")}</span>
    </div>
  );
}

function opBadge(op: AgenticCodeFileOp["operation"]) {
  const styles: Record<AgenticCodeFileOp["operation"], string> = {
    create: "bg-green-100 text-green-700",
    edit: "bg-blue-100 text-blue-700",
    delete: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[op]}`}>
      {op}
    </span>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  return <>Working… {seconds}s elapsed</>;
}

const RESOLUTION_BADGE: Record<string, { label: string; className: string }> = {
  approved: { label: "✓ Approved", className: "text-green-700 bg-green-50" },
  allowed: { label: "✓ Allowed", className: "text-green-700 bg-green-50" },
  denied: { label: "✗ Denied", className: "text-red-700 bg-red-50" },
  changes_requested: { label: "↺ Changes requested", className: "text-amber-700 bg-amber-50" },
  done: { label: "✓ Done", className: "text-green-700 bg-green-50" },
};

function CardShell({
  agent,
  resolution,
  children,
}: {
  agent: string;
  resolution: string;
  children: React.ReactNode;
}) {
  const badge = RESOLUTION_BADGE[resolution];
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[85%] space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{agent}</p>
          {badge && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          )}
        </div>
        <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

function PermissionCard({
  entry,
  onAllow,
  onDeny,
}: {
  entry: Extract<ChatEntry, { kind: "permission" }>;
  onAllow: () => void;
  onDeny: () => void;
}) {
  const pending = entry.resolution === "pending";
  return (
    <CardShell agent={entry.agent} resolution={entry.resolution}>
      <p className="mb-2 text-xs text-gray-500">{entry.taskTitle}</p>
      <div className="space-y-1.5">
        {entry.ops.map((op, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            {opBadge(op.operation)}
            <code className="text-gray-700">{op.path}</code>
          </div>
        ))}
      </div>
      {pending && (
        <>
          <p className="mt-2 text-xs text-amber-700">
            Coding Agent wants permission to make {entry.ops.length === 1 ? "this file change" : `these ${entry.ops.length} file changes`}.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onDeny}
              className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-200 transition-colors"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={onAllow}
              className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
            >
              Allow
            </button>
          </div>
        </>
      )}
    </CardShell>
  );
}

function BatchCard({
  entry,
  onApprove,
  onRequestChanges,
  locked,
}: {
  entry: Extract<ChatEntry, { kind: "batch" }>;
  onApprove: () => void;
  onRequestChanges: () => void;
  locked: boolean;
}) {
  const pending = entry.resolution === "pending";
  return (
    <CardShell agent={entry.agent} resolution={entry.resolution}>
      <p className="mb-2 text-xs font-semibold text-gray-700">Review — {entry.taskTitle}</p>
      <div className="space-y-1.5">
        {entry.ops.map((op, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            {opBadge(op.operation)}
            <code className="text-gray-700">{op.path}</code>
          </div>
        ))}
      </div>
      {pending && locked && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-xs italic text-gray-400">
          Waiting for your feedback below…
        </p>
      )}
      {pending && !locked && (
        <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={onRequestChanges}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Request changes
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-green-700 transition-colors"
          >
            Approve
          </button>
        </div>
      )}
    </CardShell>
  );
}

function ExecutorCard({
  entry,
  onFinish,
}: {
  entry: Extract<ChatEntry, { kind: "executor" }>;
  onFinish: (note: string) => void;
}) {
  const pending = entry.resolution === "pending";
  return (
    <CardShell agent={entry.agent} resolution={entry.resolution}>
      <p className="text-sm text-gray-600">File generated — open manually:</p>
      <ul className="mt-2 space-y-1 text-sm">
        {entry.paths.map((p) => (
          <li key={p}>
            <code className="rounded bg-gray-100 px-1.5 py-0.5">{p}</code>
          </li>
        ))}
      </ul>
      {pending && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => onFinish("Marked as done.")}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Mark as done
          </button>
        </div>
      )}
    </CardShell>
  );
}

function EntryView({
  entry,
  previousCreatedAt,
  feedbackTarget,
  onAllow,
  onDeny,
  onApproveBatch,
  onRequestBatchChanges,
  onFinishExecution,
}: {
  entry: ChatEntry;
  previousCreatedAt: number | null;
  feedbackTarget: "batch" | null;
  onAllow: () => void;
  onDeny: () => void;
  onApproveBatch: () => void;
  onRequestBatchChanges: () => void;
  onFinishExecution: (note: string) => void;
}) {
  switch (entry.kind) {
    case "user":
      return (
        <div className="flex justify-end">
          <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
            {entry.text}
          </div>
        </div>
      );
    case "text":
      return (
        <div className="flex justify-start">
          <div className="max-w-[75%] space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{entry.agent}</p>
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-800">{entry.text}</div>
            <MessageFooter copyText={entry.text} createdAt={entry.createdAt} previousCreatedAt={previousCreatedAt} />
          </div>
        </div>
      );
    case "permission":
      return <PermissionCard entry={entry} onAllow={onAllow} onDeny={onDeny} />;
    case "batch":
      return (
        <BatchCard
          entry={entry}
          onApprove={onApproveBatch}
          onRequestChanges={onRequestBatchChanges}
          locked={feedbackTarget === "batch"}
        />
      );
    case "executor":
      return <ExecutorCard entry={entry} onFinish={onFinishExecution} />;
  }
}

const MAX_COMPOSER_HEIGHT = 200;

// Idle: filled yellow, static. Thinking: filled light blue, spinning — and
// crucially, toggling the spin class off snaps the icon back to its
// upright (0deg) orientation rather than freezing mid-rotation, since a
// removed CSS animation reverts to the element's base (untransformed)
// state. A brief opacity pulse marks the moment the state flips either way.
function ThinkingIndicator({ thinking }: { thinking: boolean }) {
  const [pulsing, setPulsing] = useState(false);
  const prevThinking = useRef(thinking);

  useEffect(() => {
    if (prevThinking.current === thinking) return;
    prevThinking.current = thinking;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), 600);
    return () => clearTimeout(t);
  }, [thinking]);

  return (
    <div
      title={thinking ? "Thinking…" : "Idle"}
      className={[
        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition-colors duration-300",
        thinking ? "bg-sky-200" : "bg-amber-400",
        pulsing ? "animate-pulse" : "",
      ].join(" ")}
    >
      <Zap
        className={["h-4 w-4", thinking ? "text-sky-600 animate-spin" : "text-white"].join(" ")}
        fill="currentColor"
        strokeWidth={1.5}
      />
    </div>
  );
}

// Fixed-height bar reserved between the chat stream and the composer —
// always mounted, so it never shifts layout when it fills or empties. Holds
// the Zap status indicator plus a live-ticking elapsed timer for whichever
// real model call is currently in flight. Living outside the scrolling
// entries list means it can't drift away from the bottom as later chat
// messages arrive, unlike an appended-then-removed chat bubble would.
function FeedbackBar({ thinking, startedAt }: { thinking: boolean; startedAt: number | null }) {
  return (
    <div className="flex h-11 flex-shrink-0 items-center gap-2 border-t border-gray-100 px-3">
      <ThinkingIndicator thinking={thinking} />
      {thinking && startedAt !== null && (
        <span className="text-xs italic text-gray-500">
          <ElapsedTimer startedAt={startedAt} />
        </span>
      )}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
  }, [value, textareaRef]);

  return (
    <div className="flex flex-shrink-0 items-end gap-2 border-t border-gray-100 p-3">
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={500}
        style={{ maxHeight: MAX_COMPOSER_HEIGHT }}
        className="min-h-[44px] flex-1 resize-none overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="mb-0.5 flex-shrink-0 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
      >
        Send
      </button>
    </div>
  );
}

export function AgenticCodeView() {
  const [sessionMeta, setSessionMeta] = useState<AgenticCodeSessionSummary[]>(INITIAL_SESSION_META);
  const [sessionData, setSessionData] = useState<Record<string, SessionState>>(createInitialSessions);
  const [activeId, setActiveId] = useState("s-current");
  const [showAbout, setShowAbout] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const session = sessionData[activeId];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [session.entries.length, activeId]);

  function patchSession(sid: string, patch: Partial<SessionState>) {
    setSessionData((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch } }));
  }

  function appendEntry(sid: string, entry: ChatEntry) {
    setSessionData((prev) => ({ ...prev, [sid]: { ...prev[sid], entries: [...prev[sid].entries, entry] } }));
  }

  // Marks a real model call in flight for the duration bar reserved below
  // the chat stream (see FeedbackBar) — a fixed-position live timer instead
  // of a chat bubble, so it can't drift away from the bottom as later
  // messages arrive.
  function beginModelWork(sid: string) {
    patchSession(sid, { awaitingModel: true, modelWorkStartedAt: Date.now() });
  }

  function endModelWork(sid: string) {
    patchSession(sid, { awaitingModel: false, modelWorkStartedAt: null });
  }

  function pushText(sid: string, agent: string, text: string) {
    appendEntry(sid, makeEntry({ kind: "text", agent, text }));
  }

  function pushUser(sid: string, text: string) {
    appendEntry(sid, makeEntry({ kind: "user", text }));
  }

  function resolvePending(sid: string, resolution: string) {
    setSessionData((prev) => {
      const s = prev[sid];
      if (!s.pendingEntryId) return prev;
      const entries = s.entries.map((e) => (e.id === s.pendingEntryId ? ({ ...e, resolution } as ChatEntry) : e));
      return { ...prev, [sid]: { ...s, entries, pendingEntryId: null } };
    });
  }

  function markSessionStatus(sid: string, status: AgenticCodeSessionSummary["status"]) {
    setSessionMeta((prev) => prev.map((s) => (s.id === sid ? { ...s, status, lastActive: "now" } : s)));
  }

  function setProjectName(sid: string, name: string) {
    patchSession(sid, { projectName: name });
    setSessionMeta((prev) => prev.map((s) => (s.id === sid ? { ...s, name } : s)));
  }

  function startPermission(sid: string, op: AgenticCodeFileOp) {
    patchSession(sid, { fileOp: op });
    const entry = makeEntry({ kind: "permission" as const, agent: "Coding Agent", taskTitle: "Build index.html", ops: [op], resolution: "pending" as PermissionResolution });
    appendEntry(sid, entry);
    patchSession(sid, { pendingEntryId: entry.id });
  }

  // Real project-folder creation, then a single permission gate for the
  // one file this MVP ever builds — no Planner/plan stage. See ADR 0003's
  // revamp section for why the multi-task plan was dropped.
  async function beginBuild(sid: string, projectBaseName: string) {
    patchSession(sid, { stage: "building" });
    beginModelWork(sid);
    try {
      const { dir } = await createAgenticCodeProject(projectBaseName);
      setProjectName(sid, dir);
      pushText(sid, "Intake", `Created ${projectPath(dir)}/. Handing off to the Coding Agent.`);
      const op: AgenticCodeFileOp = {
        operation: "create",
        path: "index.html",
        preview: "A single self-contained HTML page implementing the request, styled with Tailwind via CDN.",
      };
      startPermission(sid, op);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      pushText(sid, "Coding Agent", `Couldn't create the project folder (${message}).`);
      patchSession(sid, { stage: "input" });
    } finally {
      endModelWork(sid);
    }
  }

  async function handleStart(sid: string, text: string) {
    pushUser(sid, text);
    markSessionStatus(sid, "in_progress");
    const detectedName = extractProjectName(text);
    if (detectedName) setProjectName(sid, detectedName);
    patchSession(sid, { stage: "clarifying", requestText: text });
    beginModelWork(sid);

    try {
      await streamAgenticCodePreview(text, (event) => {
        switch (event.type) {
          case "question_ready":
            pushText(sid, "Intake", event.question);
            break;
          case "error":
            pushText(sid, "Intake", event.message);
            patchSession(sid, { stage: "input" });
            break;
        }
      });
    } finally {
      endModelWork(sid);
    }
  }

  function handleClarifyAnswer(sid: string, text: string) {
    pushUser(sid, text);
    if (session.projectName) {
      pushText(sid, "Intake", "Got it — handing off to the Coding Agent.");
      beginBuild(sid, session.projectName);
    } else {
      pushText(sid, "Intake", "Got it.");
      patchSession(sid, { stage: "naming" });
      pushText(sid, "Intake", `What should we call this project? It becomes the folder at ${PROJECT_ROOT}/<name>.`);
    }
  }

  function handleProjectName(sid: string, text: string) {
    pushUser(sid, text);
    const name = slugify(text) || "untitled-project";
    pushText(sid, "Intake", "Got it — handing off to the Coding Agent.");
    beginBuild(sid, name);
  }

  function handlePermission(allow: boolean) {
    const sid = activeId;
    const op = session.fileOp;
    if (!op) return;
    resolvePending(sid, allow ? "allowed" : "denied");
    const feedback = session.pendingFeedback;
    patchSession(sid, { pendingFeedback: null });

    if (!allow) {
      pushText(sid, "Coding Agent", "Build denied — nothing was written.");
      markSessionStatus(sid, "idle");
      patchSession(sid, { stage: "input" });
      return;
    }

    const projectDir = session.projectName ?? "untitled-project";
    const requestContext = session.requestText ?? "";
    beginModelWork(sid);
    streamWriteTask(projectDir, requestContext, "Build index.html", [op], feedback, (event) => {
      switch (event.type) {
        case "log":
          pushText(sid, "Coding Agent", event.message);
          break;
        case "file_written":
          pushText(sid, "Coding Agent", `Wrote ${event.path}`);
          break;
        case "error":
          pushText(sid, "Coding Agent", `Write failed: ${event.message}`);
          startPermission(sid, op);
          break;
        case "task_complete": {
          pushText(sid, "Coding Agent", "Build complete — awaiting your review.");
          const entry = makeEntry({ kind: "batch" as const, agent: "Coding Agent", taskTitle: "Build index.html", ops: [op], resolution: "pending" as BatchResolution });
          appendEntry(sid, entry);
          patchSession(sid, { stage: "batch_review", pendingEntryId: entry.id });
          break;
        }
      }
    }).finally(() => endModelWork(sid));
  }

  function handleApproveBatch() {
    const sid = activeId;
    resolvePending(sid, "approved");
    pushText(sid, "Executor", "Build complete — preparing output.");
    const dir = projectPath(session.projectName ?? "untitled-project");
    const entry = makeEntry({
      kind: "executor" as const,
      agent: "Executor",
      paths: [`${dir}/index.html`],
      resolution: "pending" as ExecutorResolution,
    });
    appendEntry(sid, entry);
    patchSession(sid, { stage: "executing", pendingEntryId: entry.id });
  }

  function beginBatchFeedback() {
    const sid = activeId;
    patchSession(sid, { feedbackTarget: "batch" });
    pushText(sid, "Coding Agent", "What should change about this file?");
    composerRef.current?.focus();
  }

  function handleBatchFeedback(sid: string, feedback: string) {
    resolvePending(sid, "changes_requested");
    pushUser(sid, feedback);
    patchSession(sid, { feedbackTarget: null, stage: "building", pendingFeedback: feedback });
    pushText(sid, "Coding Agent", "Applying your feedback…");
    const op = session.fileOp;
    if (op) startPermission(sid, op);
  }

  function handleFinishExecution(note: string) {
    const sid = activeId;
    resolvePending(sid, "done");
    pushText(sid, "Executor", note);
    pushText(sid, "Executor", "Session complete. Review the result yourself, then start fresh whenever you're ready.");
    markSessionStatus(sid, "done");
    patchSession(sid, { stage: "done" });
  }

  function handleNewSession() {
    const id = `s-${Date.now()}`;
    setSessionMeta((prev) => [{ id, name: "New session", lastActive: "now", status: "idle", archived: false }, ...prev]);
    setSessionData((prev) => ({ ...prev, [id]: freshSession() }));
    setActiveId(id);
  }

  function switchToNextAvailable(excludeId: string) {
    const remaining = sessionMeta.filter((s) => s.id !== excludeId && !s.archived);
    if (remaining.length > 0) {
      setActiveId(remaining[0].id);
    } else {
      handleNewSession();
    }
  }

  function handleArchiveSession(id: string) {
    setSessionMeta((prev) => prev.map((s) => (s.id === id ? { ...s, archived: true } : s)));
    if (id === activeId) switchToNextAvailable(id);
  }

  function handleUnarchiveSession(id: string) {
    setSessionMeta((prev) => prev.map((s) => (s.id === id ? { ...s, archived: false } : s)));
  }

  function handleDeleteSession(id: string) {
    setSessionMeta((prev) => prev.filter((s) => s.id !== id));
    setSessionData((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === activeId) switchToNextAvailable(id);
  }

  function handleComposerSubmit() {
    const sid = activeId;
    const text = session.composerText.trim();
    if (!text) return;
    patchSession(sid, { composerText: "" });
    if (session.feedbackTarget === "batch") {
      handleBatchFeedback(sid, text);
    } else if (session.stage === "input") {
      handleStart(sid, text);
    } else if (session.stage === "clarifying") {
      handleClarifyAnswer(sid, text);
    } else if (session.stage === "naming") {
      handleProjectName(sid, text);
    }
  }

  const composerMode: "build_request" | "clarify_answer" | "project_name" | "batch_feedback" | "disabled" =
    session.awaitingModel
      ? "disabled"
      : session.feedbackTarget === "batch"
        ? "batch_feedback"
        : session.stage === "input"
          ? "build_request"
          : session.stage === "clarifying"
            ? "clarify_answer"
            : session.stage === "naming"
              ? "project_name"
              : "disabled";

  const composerPlaceholder: Record<typeof composerMode, string> = {
    build_request: "Describe what you want built…",
    clarify_answer: "Answer the question above…",
    project_name: "Name this project (used as the folder name)…",
    batch_feedback: "What should change about this file?",
    disabled: session.awaitingModel
      ? "Thinking…"
      : session.stage === "done"
        ? "Start a new session to continue"
        : "Waiting for you to respond above…",
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-4">

      {/* Header */}
      <div className="flex flex-shrink-0 items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agentic Code</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {showAbout
              ? "How the pipeline is put together, and every constraint explained."
              : "Describe what you want built. Intake and a Coding Agent take it from there — you approve every step."}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-4">
          {!showAbout && (
            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className="text-sm text-gray-400 hover:text-blue-600 transition-colors"
            >
              about
            </button>
          )}
          <Link href="/" className="text-sm text-gray-400 hover:text-indigo-600 transition-colors">
            ← All tools
          </Link>
        </div>
      </div>

      {showAbout ? (
        <div className="flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => setShowAbout(false)}
            className="mb-3 text-xs text-gray-400 hover:text-blue-600 transition-colors"
          >
            ← back
          </button>
          <AgenticCodeAbout />
        </div>
      ) : (
        <>
          <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[220px_1fr]">
            <div className="flex flex-col gap-4 overflow-y-auto">
              <AgenticCodeSessionSwitcher
                sessions={sessionMeta}
                activeId={activeId}
                onSwitch={setActiveId}
                onNew={handleNewSession}
                onArchive={handleArchiveSession}
                onUnarchive={handleUnarchiveSession}
                onDelete={handleDeleteSession}
              />
            </div>

            <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
                {session.entries.length === 0 ? (
                  <p className="mt-8 text-center text-sm text-gray-400">
                    Describe what you want built to get started.
                  </p>
                ) : (
                  session.entries.map((entry, i) => (
                    <EntryView
                      key={entry.id}
                      entry={entry}
                      previousCreatedAt={i > 0 ? session.entries[i - 1].createdAt : null}
                      feedbackTarget={session.feedbackTarget}
                      onAllow={() => handlePermission(true)}
                      onDeny={() => handlePermission(false)}
                      onApproveBatch={handleApproveBatch}
                      onRequestBatchChanges={beginBatchFeedback}
                      onFinishExecution={handleFinishExecution}
                    />
                  ))
                )}
                {session.stage === "done" && (
                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={handleNewSession}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                    >
                      Start new session
                    </button>
                  </div>
                )}
              </div>

              <FeedbackBar thinking={session.awaitingModel} startedAt={session.modelWorkStartedAt} />

              <Composer
                value={session.composerText}
                onChange={(v) => patchSession(activeId, { composerText: v })}
                onSubmit={handleComposerSubmit}
                placeholder={composerPlaceholder[composerMode]}
                disabled={composerMode === "disabled"}
                textareaRef={composerRef}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
