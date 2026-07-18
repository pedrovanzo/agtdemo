"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Check, Copy, Zap } from "lucide-react";
import {
  AgenticCodeFileOp,
  AgenticCodeOutputKind,
  AgenticCodePlan,
  AgenticCodeStage,
  streamAgenticCodePreview,
} from "@/lib/api";
import { AgenticCodeAbout } from "./AgenticCodeAbout";
import { AgenticCodeSessionSwitcher, AgenticCodeSessionSummary } from "./AgenticCodeSessionSwitcher";

// Most of this component is still driven by local mock state — see the
// "not yet wired" note in lib/api.ts. The one real piece so far: the initial
// Intake question + a sample snippet stream in from a real call to the
// local model via streamAgenticCodePreview(). Everything after that (plan,
// build, review, execute) is still mocked.

type PlanResolution = "pending" | "approved" | "changes_requested" | "cancelled";
type PermissionResolution = "pending" | "allowed" | "denied";
type BatchResolution = "pending" | "approved" | "changes_requested";
type ExecutorResolution = "pending" | "done";

type ChatEntry = { id: string; createdAt: number } & (
  | { kind: "user"; text: string }
  | { kind: "text"; agent: string; text: string }
  | { kind: "snippet"; agent: string; code: string }
  | { kind: "plan"; agent: string; plan: AgenticCodePlan; revision: number; projectName: string; resolution: PlanResolution }
  | { kind: "permission"; agent: string; taskTitle: string; op: AgenticCodeFileOp; resolution: PermissionResolution }
  | { kind: "batch"; agent: string; taskTitle: string; ops: AgenticCodeFileOp[]; resolution: BatchResolution }
  | {
      kind: "executor";
      agent: string;
      outputKind: AgenticCodeOutputKind;
      paths: string[];
      runCommand?: string;
      resolution: ExecutorResolution;
    }
);

type SessionState = {
  stage: AgenticCodeStage;
  entries: ChatEntry[];
  pendingEntryId: string | null;
  plan: AgenticCodePlan | null;
  revisionCount: number;
  taskIndex: number;
  opIndex: number;
  outputKind: AgenticCodeOutputKind;
  composerText: string;
  feedbackTarget: "plan" | "batch" | null;
  projectName: string | null;
  awaitingModel: boolean;
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
    plan: null,
    revisionCount: 0,
    taskIndex: 0,
    opIndex: 0,
    outputKind: "html",
    composerText: "",
    feedbackTarget: null,
    projectName: null,
    awaitingModel: false,
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

function buildMockPlan(outputKind: AgenticCodeOutputKind): AgenticCodePlan {
  if (outputKind === "framework") {
    return {
      summary: "A Next.js landing page with a hero, feature grid, and a working contact form.",
      tasks: [
        {
          id: "t1",
          title: "Scaffold Next.js app + Tailwind config",
          ops: [
            { operation: "create", path: "app/layout.tsx", preview: "export default function RootLayout({ children }) { ... }" },
            { operation: "create", path: "tailwind.config.ts", preview: "module.exports = { content: [\"./app/**/*.tsx\"] }" },
          ],
        },
        {
          id: "t2",
          title: "Build hero + feature grid",
          ops: [
            { operation: "create", path: "app/page.tsx", preview: "<Hero />\n<FeatureGrid />" },
            { operation: "create", path: "components/FeatureGrid.tsx", preview: "export function FeatureGrid() { ... }" },
          ],
        },
        {
          id: "t3",
          title: "Add contact form with client-side validation",
          ops: [
            { operation: "create", path: "components/ContactForm.tsx", preview: "const [errors, setErrors] = useState({})" },
            { operation: "edit", path: "app/page.tsx", preview: "+ <ContactForm />" },
          ],
        },
      ],
    };
  }

  return {
    summary: "A static portfolio site with a hero, project grid, and contact section, styled with Tailwind via CDN.",
    tasks: [
      {
        id: "t1",
        title: "Scaffold page structure + Tailwind CDN",
        ops: [
          { operation: "create", path: "index.html", preview: "<!doctype html>\n<script src=\"https://cdn.tailwindcss.com\"></script>" },
          { operation: "create", path: "styles/custom.css", preview: ".hero { background: radial-gradient(...); }" },
        ],
      },
      {
        id: "t2",
        title: "Build hero + project grid sections",
        ops: [
          { operation: "edit", path: "index.html", preview: "+ <section id=\"projects\">...</section>" },
          { operation: "create", path: "scripts/projects.js", preview: "const projects = [{ title: \"...\" }]" },
        ],
      },
      {
        id: "t3",
        title: "Add contact section",
        ops:
          outputKind === "multi_page"
            ? [{ operation: "create", path: "contact.html", preview: "<!doctype html>\n<form>...</form>" }]
            : [{ operation: "edit", path: "index.html", preview: "+ <section id=\"contact\">...</section>" }],
      },
    ],
  };
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function createInitialSessions(): Record<string, SessionState> {
  const todoPlan = buildMockPlan("framework");
  const todoBase = Date.now() - 2 * HOUR;
  const todoPlanEntry = makeEntry(
    { kind: "plan" as const, agent: "Planner", plan: todoPlan, revision: 0, projectName: "todo-app-nextjs", resolution: "pending" as PlanResolution },
    todoBase + 2 * MINUTE,
  );

  const landingPlan = buildMockPlan("html");
  const landingBase = Date.now() - DAY;

  return {
    "s-current": freshSession(),

    "s-todo": {
      ...freshSession(),
      stage: "plan_review",
      outputKind: "framework",
      plan: todoPlan,
      pendingEntryId: todoPlanEntry.id,
      projectName: "todo-app-nextjs",
      entries: [
        makeEntry({ kind: "user", text: "A Next.js todo app with local storage persistence, call it todo-app-nextjs" }, todoBase),
        makeEntry({ kind: "text", agent: "Intake", text: "Parsed request — Next.js project requested." }, todoBase + MINUTE),
        todoPlanEntry,
      ],
    },

    "s-landing": {
      ...freshSession(),
      stage: "done",
      outputKind: "html",
      plan: landingPlan,
      taskIndex: landingPlan.tasks.length,
      projectName: "coffee-landing-page",
      entries: [
        makeEntry({ kind: "user", text: "A one-page hero landing for a coffee brand, name it coffee-landing-page" }, landingBase),
        makeEntry({ kind: "text", agent: "Intake", text: "Parsed request — single static page, no framework." }, landingBase + MINUTE),
        makeEntry(
          { kind: "plan", agent: "Planner", plan: landingPlan, revision: 0, projectName: "coffee-landing-page", resolution: "approved" as PlanResolution },
          landingBase + 2 * MINUTE,
        ),
        makeEntry({ kind: "text", agent: "Coding Agent", text: "All tasks complete." }, landingBase + 6 * MINUTE),
        makeEntry(
          {
            kind: "executor",
            agent: "Executor",
            outputKind: "html" as AgenticCodeOutputKind,
            paths: [`${projectPath("coffee-landing-page")}/index.html`],
            resolution: "done" as ExecutorResolution,
          },
          landingBase + 7 * MINUTE,
        ),
        makeEntry(
          { kind: "text", agent: "Executor", text: `Opened ${projectPath("coffee-landing-page")}/index.html in browser.` },
          landingBase + 7 * MINUTE + 5000,
        ),
      ],
    },
  };
}

const INITIAL_SESSION_META: AgenticCodeSessionSummary[] = [
  { id: "s-current", name: "New session", lastActive: "now", status: "idle", archived: false },
  { id: "s-todo", name: "todo-app-nextjs", lastActive: "2h ago", status: "in_progress", archived: false },
  { id: "s-landing", name: "coffee-landing-page", lastActive: "yesterday", status: "done", archived: false },
];

const STEP_DEFS = [
  { key: "intake", label: "Input" },
  { key: "plan", label: "Plan" },
  { key: "build", label: "Build" },
  { key: "execute", label: "Execute" },
] as const;

function stageToStepIndex(stage: AgenticCodeStage): number {
  switch (stage) {
    case "input":
    case "clarifying":
    case "naming":
      return 0;
    case "planning":
    case "plan_review":
      return 1;
    case "building":
    case "batch_review":
      return 2;
    case "executing":
      return 3;
    case "done":
      return 4;
  }
}

function Stepper({ stage }: { stage: AgenticCodeStage }) {
  const current = stageToStepIndex(stage);
  return (
    <div className="flex items-center">
      {STEP_DEFS.map((step, i) => {
        const status = i < current ? "done" : i === current ? "active" : "idle";
        return (
          <div key={step.key} className="flex flex-1 items-center last:flex-none">
            <div
              className={[
                "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                status === "done"
                  ? "border-green-400 bg-green-50 text-green-700"
                  : status === "active"
                    ? "border-blue-400 bg-blue-50 text-blue-700 animate-pulse"
                    : "border-gray-200 bg-gray-50 text-gray-400",
              ].join(" ")}
            >
              {i + 1}
            </div>
            <span className={`ml-2 text-xs font-semibold ${status === "idle" ? "text-gray-400" : "text-gray-700"}`}>
              {step.label}
            </span>
            {i < STEP_DEFS.length - 1 && (
              <div className={`mx-3 h-px flex-1 ${i < current ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
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

const RESOLUTION_BADGE: Record<string, { label: string; className: string }> = {
  approved: { label: "✓ Approved", className: "text-green-700 bg-green-50" },
  allowed: { label: "✓ Allowed", className: "text-green-700 bg-green-50" },
  denied: { label: "✗ Denied", className: "text-red-700 bg-red-50" },
  changes_requested: { label: "↺ Changes requested", className: "text-amber-700 bg-amber-50" },
  cancelled: { label: "✗ Cancelled", className: "text-gray-500 bg-gray-100" },
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

function PlanCard({
  entry,
  onApprove,
  onRequestChanges,
  onCancel,
  locked,
}: {
  entry: Extract<ChatEntry, { kind: "plan" }>;
  onApprove: () => void;
  onRequestChanges: () => void;
  onCancel: () => void;
  locked: boolean;
}) {
  const pending = entry.resolution === "pending";
  return (
    <CardShell agent={entry.agent} resolution={entry.resolution}>
      <p className="mb-1 text-xs font-semibold text-gray-700">
        Plan{entry.revision > 0 ? ` (revision ${entry.revision})` : ""}
      </p>
      <p className="mb-2 font-mono text-[11px] text-gray-400">{projectPath(entry.projectName)}/</p>
      <p className="mb-3 text-sm text-gray-700">{entry.plan.summary}</p>
      <div className="space-y-2">
        {entry.plan.tasks.map((task, i) => (
          <div key={task.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
            <p className="text-sm font-semibold text-gray-800">
              {i + 1}. {task.title}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {task.ops.map((op, j) => (
                <span
                  key={j}
                  className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-600"
                >
                  {opBadge(op.operation)}
                  <code className="text-gray-700">{op.path}</code>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      {pending && locked && (
        <p className="mt-3 border-t border-gray-100 pt-3 text-xs italic text-gray-400">
          Waiting for your feedback below…
        </p>
      )}
      {pending && !locked && (
        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
          <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-400 hover:text-red-600 transition-colors">
            Cancel
          </button>
          <div className="flex gap-2">
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
              Approve plan
            </button>
          </div>
        </div>
      )}
    </CardShell>
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
      <div className="flex items-center gap-2">
        {opBadge(entry.op.operation)}
        <code className="text-sm font-semibold text-gray-800">{entry.op.path}</code>
      </div>
      <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-green-400">{entry.op.preview}</pre>
      {pending && (
        <>
          <p className="mt-2 text-xs text-amber-700">
            Coding Agent wants permission to {entry.op.operation} this file.
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
      {entry.outputKind === "framework" && (
        <>
          <p className="text-sm text-gray-600">
            Framework project — run it yourself, this tool won&apos;t launch a dev server for you:
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-3 text-xs text-green-400">{entry.runCommand}</pre>
          {pending && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onFinish("Ran the dev server.")}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                I ran it
              </button>
            </div>
          )}
        </>
      )}
      {entry.outputKind === "multi_page" && (
        <>
          <p className="text-sm text-gray-600">Multiple pages generated — open each manually:</p>
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
                onClick={() => onFinish("Opened pages manually.")}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Mark as opened
              </button>
            </div>
          )}
        </>
      )}
      {entry.outputKind === "html" && (
        <>
          <p className="text-sm text-gray-600">
            Plain HTML — opening <code className="rounded bg-gray-100 px-1.5 py-0.5">{entry.paths[0]}</code> directly.
          </p>
          {pending && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onFinish(`Opened ${entry.paths[0]} in browser.`)}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Open in Browser
              </button>
            </div>
          )}
        </>
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
  onApprovePlan,
  onRequestPlanChanges,
  onCancelPlan,
  onApproveBatch,
  onRequestBatchChanges,
  onFinishExecution,
}: {
  entry: ChatEntry;
  previousCreatedAt: number | null;
  feedbackTarget: "plan" | "batch" | null;
  onAllow: () => void;
  onDeny: () => void;
  onApprovePlan: () => void;
  onRequestPlanChanges: () => void;
  onCancelPlan: () => void;
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
    case "snippet":
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] w-full space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{entry.agent}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-gray-900 px-4 py-3 text-xs text-green-400">
              {entry.code}
            </pre>
            <MessageFooter copyText={entry.code} createdAt={entry.createdAt} previousCreatedAt={previousCreatedAt} />
          </div>
        </div>
      );
    case "plan":
      return (
        <PlanCard
          entry={entry}
          onApprove={onApprovePlan}
          onRequestChanges={onRequestPlanChanges}
          onCancel={onCancelPlan}
          locked={feedbackTarget === "plan"}
        />
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

function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  thinking,
  textareaRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled: boolean;
  thinking: boolean;
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
      <ThinkingIndicator thinking={thinking} />
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

  function beginPlanning(sid: string, outputKind: AgenticCodeOutputKind, projectName: string) {
    patchSession(sid, { stage: "planning", outputKind });
    pushText(sid, "Planner", "Drafting a plan…");
    setTimeout(() => {
      const plan = buildMockPlan(outputKind);
      const entry = makeEntry({ kind: "plan" as const, agent: "Planner", plan, revision: 0, projectName, resolution: "pending" as PlanResolution });
      appendEntry(sid, entry);
      patchSession(sid, { stage: "plan_review", plan, pendingEntryId: entry.id });
    }, 700);
  }

  async function handleStart(sid: string, text: string) {
    pushUser(sid, text);
    markSessionStatus(sid, "in_progress");
    const detectedName = extractProjectName(text);
    if (detectedName) setProjectName(sid, detectedName);
    patchSession(sid, { stage: "clarifying", awaitingModel: true });
    pushText(sid, "Intake", "Reading your request…");

    try {
      await streamAgenticCodePreview(text, (event) => {
        switch (event.type) {
          case "log":
            pushText(sid, "Intake", event.message);
            break;
          case "question_ready":
            pushText(sid, "Intake", event.question);
            break;
          case "snippet_ready":
            appendEntry(sid, makeEntry({ kind: "snippet", agent: "Coding Agent", code: event.snippet }));
            break;
          case "error":
            pushText(sid, "Intake", event.message);
            patchSession(sid, { stage: "input" });
            break;
        }
      });
    } finally {
      patchSession(sid, { awaitingModel: false });
    }
  }

  function handleClarifyAnswer(sid: string, text: string) {
    pushUser(sid, text);
    const lower = text.toLowerCase();
    const outputKind: AgenticCodeOutputKind = lower.includes("next") ? "framework" : lower.includes("multi") ? "multi_page" : "html";
    if (session.projectName) {
      pushText(sid, "Intake", "Got it — handing off clean instructions to the Planner.");
      beginPlanning(sid, outputKind, session.projectName);
    } else {
      pushText(sid, "Intake", "Got it.");
      patchSession(sid, { stage: "naming", outputKind });
      pushText(sid, "Intake", `What should we call this project? It becomes the folder at ${PROJECT_ROOT}/<name>.`);
    }
  }

  function handleProjectName(sid: string, text: string) {
    pushUser(sid, text);
    const name = slugify(text) || "untitled-project";
    setProjectName(sid, name);
    pushText(sid, "Intake", `Got it — creating ${projectPath(name)}/. Handing off clean instructions to the Planner.`);
    beginPlanning(sid, session.outputKind, name);
  }

  function handleApprovePlan() {
    const sid = activeId;
    const firstTask = session.plan?.tasks[0];
    resolvePending(sid, "approved");
    pushText(sid, "Planner", "Plan approved — handing off to the Coding Agent.");
    patchSession(sid, { stage: "building", taskIndex: 0, opIndex: 0 });
    if (firstTask) {
      pushText(sid, "Coding Agent", `Starting task 1: ${firstTask.title}`);
      const op = firstTask.ops[0];
      if (op) {
        const entry = makeEntry({ kind: "permission" as const, agent: "Coding Agent", taskTitle: firstTask.title, op, resolution: "pending" as PermissionResolution });
        appendEntry(sid, entry);
        patchSession(sid, { pendingEntryId: entry.id });
      }
    }
  }

  function beginPlanFeedback() {
    const sid = activeId;
    patchSession(sid, { feedbackTarget: "plan" });
    pushText(sid, "Planner", "What should change about this plan?");
    composerRef.current?.focus();
  }

  function handlePlanFeedback(sid: string, feedback: string) {
    const basePlan = session.plan;
    if (!basePlan) return;
    resolvePending(sid, "changes_requested");
    pushUser(sid, feedback);
    patchSession(sid, { feedbackTarget: null, stage: "planning" });
    pushText(sid, "Planner", "Revising the plan — keeping the tasks you didn't flag.");
    const revisionCount = session.revisionCount + 1;
    setTimeout(() => {
      const revisedPlan: AgenticCodePlan = {
        ...basePlan,
        tasks: [
          ...basePlan.tasks,
          {
            id: `revision-${revisionCount}`,
            title: `Apply feedback: "${feedback}"`,
            ops: [
              {
                operation: "edit",
                path: basePlan.tasks[0]?.ops[0]?.path ?? "index.html",
                preview: "// updated per your feedback",
              },
            ],
          },
        ],
      };
      const entry = makeEntry({
        kind: "plan" as const,
        agent: "Planner",
        plan: revisedPlan,
        revision: revisionCount,
        projectName: session.projectName ?? "untitled-project",
        resolution: "pending" as PlanResolution,
      });
      appendEntry(sid, entry);
      patchSession(sid, { stage: "plan_review", plan: revisedPlan, revisionCount, pendingEntryId: entry.id });
    }, 700);
  }

  function handleCancelPlan() {
    const sid = activeId;
    resolvePending(sid, "cancelled");
    pushText(sid, "Planner", "Task discarded — project memory is unaffected.");
    markSessionStatus(sid, "idle");
    patchSession(sid, {
      stage: "input",
      plan: null,
      taskIndex: 0,
      opIndex: 0,
      feedbackTarget: null,
      composerText: "",
      pendingEntryId: null,
    });
  }

  function handlePermission(allow: boolean) {
    const sid = activeId;
    const task = session.plan?.tasks[session.taskIndex];
    const op = task?.ops[session.opIndex];
    if (!task || !op) return;
    resolvePending(sid, allow ? "allowed" : "denied");
    const nextOpIndex = session.opIndex + 1;
    if (nextOpIndex < task.ops.length) {
      const nextOp = task.ops[nextOpIndex];
      const entry = makeEntry({ kind: "permission" as const, agent: "Coding Agent", taskTitle: task.title, op: nextOp, resolution: "pending" as PermissionResolution });
      appendEntry(sid, entry);
      patchSession(sid, { opIndex: nextOpIndex, pendingEntryId: entry.id });
    } else {
      pushText(sid, "Coding Agent", `Task ${session.taskIndex + 1} complete — awaiting your review.`);
      const entry = makeEntry({ kind: "batch" as const, agent: "Coding Agent", taskTitle: task.title, ops: task.ops, resolution: "pending" as BatchResolution });
      appendEntry(sid, entry);
      patchSession(sid, { stage: "batch_review", pendingEntryId: entry.id });
    }
  }

  function handleApproveBatch() {
    const sid = activeId;
    const plan = session.plan;
    if (!plan) return;
    resolvePending(sid, "approved");
    const nextTaskIndex = session.taskIndex + 1;
    if (nextTaskIndex < plan.tasks.length) {
      const nextTask = plan.tasks[nextTaskIndex];
      pushText(sid, "Coding Agent", `Starting task ${nextTaskIndex + 1}: ${nextTask.title}`);
      patchSession(sid, { stage: "building", taskIndex: nextTaskIndex, opIndex: 0 });
      const op = nextTask.ops[0];
      if (op) {
        const entry = makeEntry({ kind: "permission" as const, agent: "Coding Agent", taskTitle: nextTask.title, op, resolution: "pending" as PermissionResolution });
        appendEntry(sid, entry);
        patchSession(sid, { pendingEntryId: entry.id });
      }
    } else {
      pushText(sid, "Executor", "All tasks complete — preparing output.");
      const dir = projectPath(session.projectName ?? "untitled-project");
      const paths = Array.from(
        new Set(plan.tasks.flatMap((t) => t.ops.map((o) => o.path)).filter((p) => p.endsWith(".html")))
      ).map((p) => `${dir}/${p}`);
      const entry = makeEntry({
        kind: "executor" as const,
        agent: "Executor",
        outputKind: session.outputKind,
        paths,
        runCommand: session.outputKind === "framework" ? `cd ${dir} && npm install && npm run dev` : undefined,
        resolution: "pending" as ExecutorResolution,
      });
      appendEntry(sid, entry);
      patchSession(sid, { stage: "executing", pendingEntryId: entry.id });
    }
  }

  function beginBatchFeedback() {
    const sid = activeId;
    patchSession(sid, { feedbackTarget: "batch" });
    pushText(sid, "Coding Agent", "What should change about these files?");
    composerRef.current?.focus();
  }

  function handleBatchFeedback(sid: string, feedback: string) {
    resolvePending(sid, "changes_requested");
    pushUser(sid, feedback);
    patchSession(sid, { feedbackTarget: null, stage: "building", opIndex: 0 });
    pushText(sid, "Coding Agent", "Applying your feedback to this task's files…");
    const task = session.plan?.tasks[session.taskIndex];
    const op = task?.ops[0];
    if (task && op) {
      const entry = makeEntry({ kind: "permission" as const, agent: "Coding Agent", taskTitle: task.title, op, resolution: "pending" as PermissionResolution });
      appendEntry(sid, entry);
      patchSession(sid, { pendingEntryId: entry.id });
    }
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
    if (session.feedbackTarget === "plan") {
      handlePlanFeedback(sid, text);
    } else if (session.feedbackTarget === "batch") {
      handleBatchFeedback(sid, text);
    } else if (session.stage === "input") {
      handleStart(sid, text);
    } else if (session.stage === "clarifying") {
      handleClarifyAnswer(sid, text);
    } else if (session.stage === "naming") {
      handleProjectName(sid, text);
    }
  }

  const composerMode: "build_request" | "clarify_answer" | "project_name" | "plan_feedback" | "batch_feedback" | "disabled" =
    session.awaitingModel
      ? "disabled"
      : session.feedbackTarget === "plan"
        ? "plan_feedback"
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
    plan_feedback: "What should change about the plan?",
    batch_feedback: "What should change about these files?",
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
              : "Describe what to build. Intake, Planner, and a Coding Agent take it from there — you approve every step."}
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
          <div className="flex-shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-3">
            <Stepper stage={session.stage} />
          </div>

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
                      onApprovePlan={handleApprovePlan}
                      onRequestPlanChanges={beginPlanFeedback}
                      onCancelPlan={handleCancelPlan}
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

              <Composer
                value={session.composerText}
                onChange={(v) => patchSession(activeId, { composerText: v })}
                onSubmit={handleComposerSubmit}
                placeholder={composerPlaceholder[composerMode]}
                disabled={composerMode === "disabled"}
                thinking={session.awaitingModel}
                textareaRef={composerRef}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
