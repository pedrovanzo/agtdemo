const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Navigator API ────────────────────────────────────────────────────────────

export type NavigatorLogMessage    = { type: "log";           agent: string; message: string };
export type NavigatorAgentStart    = { type: "agent_start";   agent: string };
export type NavigatorAgentDone     = { type: "agent_done";    agent: string };
export type NavigatorAgentResult   = { type: "agent_result";  agent: string; data: string };
export type NavigatorErrorMessage  = { type: "error";         message: string };
export type NavigatorEvent =
  | NavigatorLogMessage
  | NavigatorAgentStart
  | NavigatorAgentDone
  | NavigatorAgentResult
  | NavigatorErrorMessage;

export type NavigatorPayload = {
  company: string;
  url: string;
  file_query: string;
  download_folder: string;
};

export async function streamNavigate(
  payload: NavigatorPayload,
  onEvent: (e: NavigatorEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/navigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      onEvent({ type: "error", message: `Connection error: ${err.detail ?? `HTTP ${res.status}`}` });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            onEvent(JSON.parse(line.slice(6)) as NavigatorEvent);
          } catch (e) {
            console.error("Failed to parse SSE line:", line, e);
          }
        }
      }
    } finally {
      reader.cancel();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return; // user stopped — not an error
    onEvent({ type: "error", message: `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}` });
  }
}

export type LogMessage = { type: "log"; agent: string; message: string };
export type AgentStartMessage = { type: "agent_start"; agent: string };
export type AgentDoneMessage = { type: "agent_done"; agent: string };
export type AgentResultMessage = { type: "agent_result"; agent: string; data: string };
export type ErrorMessage = { type: "error"; message: string };
export type PipelineEvent =
  | LogMessage
  | AgentStartMessage
  | AgentDoneMessage
  | AgentResultMessage
  | ErrorMessage;

export type CredentialsStatus = { openrouter: boolean; serper: boolean };

export type UserCredentials = {
  openrouter_api_key?: string;
  serper_api_key?: string;
};

export async function checkCredentials(): Promise<CredentialsStatus> {
  const res = await fetch(`${API_URL}/credentials/status`);
  if (!res.ok) return { openrouter: false, serper: false };
  return res.json();
}

// ─── Agentic Code ──────────────────────────────────────────────────────────
// Single-file-per-project MVP (see ADR 0003's revamp section): one request
// becomes one self-contained HTML file, gated by permission before write and
// review after. No separate Planner/plan stage — every call here is real.

export type FileOperation = "create" | "edit" | "delete";

export type AgenticCodeFileOp = {
  operation: FileOperation;
  path: string;
  preview: string;
};

export type AgenticCodeStage =
  | "input"
  | "clarifying"
  | "naming"
  | "building"
  | "batch_review"
  | "executing"
  | "done";

// First real wire (see ADR 0003 discussion): SSE-streamed backend call that
// asks the local model for Intake's clarifying question. Real code
// generation happens later, per task, via streamWriteTask() below, once
// the user approves a plan and grants permission for that task's file ops.
export type AgenticCodePreviewEvent =
  | { type: "question_ready"; question: string }
  | { type: "error"; message: string };

// Shared SSE consumer for the agentic-code endpoints below (preview,
// write-task) — fetch + reader + decoder loop, parses `data: {json}\n\n`
// lines and hands each parsed event to onEvent.
async function consumeAgenticCodeSSE<E extends { type: string }>(
  path: string,
  body: unknown,
  onEvent: (e: E) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      onEvent({ type: "error", message: err.detail ?? `HTTP ${res.status}` } as unknown as E);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            onEvent(JSON.parse(line.slice(6)) as E);
          } catch (e) {
            console.error("Failed to parse SSE line:", line, e);
          }
        }
      }
    } finally {
      reader.cancel();
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return; // user stopped — not an error
    onEvent({ type: "error", message: `Connection failed: ${err instanceof Error ? err.message : "Unknown error"}` } as unknown as E);
  }
}

export async function streamAgenticCodePreview(
  request: string,
  onEvent: (e: AgenticCodePreviewEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return consumeAgenticCodeSSE<AgenticCodePreviewEvent>("/agentic-code/preview", { request }, onEvent, signal);
}

// Second real wire: resolves the numbered dist/<n>-<slug>/ project folder,
// then writes real files for one approved task's file ops, generating each
// file's content via a harness-augmented Ollama call and persisting it to
// disk. Plan/task decomposition itself is still mocked — only the folder
// creation and the file content + write are real.
export type CreateProjectResult = { dir: string };

export async function createAgenticCodeProject(name: string): Promise<CreateProjectResult> {
  const res = await fetch(`${API_URL}/agentic-code/create-project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export type WriteTaskEvent =
  | { type: "log"; message: string }
  | { type: "file_written"; path: string }
  | { type: "task_complete" }
  | { type: "error"; message: string };

export async function streamWriteTask(
  projectDir: string,
  requestContext: string,
  taskTitle: string,
  ops: AgenticCodeFileOp[],
  feedback: string | null,
  onEvent: (e: WriteTaskEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  return consumeAgenticCodeSSE<WriteTaskEvent>(
    "/agentic-code/write-task",
    { project_dir: projectDir, request_context: requestContext, task_title: taskTitle, ops, feedback },
    onEvent,
    signal,
  );
}

export async function streamResearch(
  topic: string,
  credentials: UserCredentials,
  costSafe: boolean,
  onEvent: (e: PipelineEvent) => void
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, ...credentials, cost_safe: costSafe }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      const errorMsg = err.detail ?? `HTTP ${res.status}`;
      onEvent({ type: "error", message: `Connection error: ${errorMsg}` });
      throw new Error(errorMsg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as PipelineEvent;
          onEvent(parsed);
        } catch (e) {
          console.error("Failed to parse SSE line:", line, e);
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    onEvent({ type: "error", message: `Connection failed: ${message}` });
    throw err;
  }
}
