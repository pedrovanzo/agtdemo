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

// ─── Agentic Code (future backend contract — not yet wired) ──────────────────
// This tool needs mid-stream human input (plan approval, per-file permission,
// batch review), which the one-shot POST -> SSE pattern above can't express.
// These types capture the intended session-based protocol (see ADR 0003) so
// the UI and a future backend agree on shape. The current UI drives itself
// from local mock state — nothing here issues a network call yet.

export type FileOperation = "create" | "edit" | "delete";

export type AgenticCodeFileOp = {
  operation: FileOperation;
  path: string;
  preview: string;
};

export type AgenticCodeTask = {
  id: string;
  title: string;
  ops: AgenticCodeFileOp[];
};

export type AgenticCodePlan = {
  summary: string;
  tasks: AgenticCodeTask[];
};

export type AgenticCodeOutputKind = "html" | "multi_page" | "framework";

export type AgenticCodeStage =
  | "input"
  | "clarifying"
  | "naming"
  | "planning"
  | "plan_review"
  | "building"
  | "batch_review"
  | "executing"
  | "done";

export type AgenticCodeEvent =
  | { type: "clarify_question"; question: string }
  | { type: "plan_ready"; plan: AgenticCodePlan }
  | { type: "permission_request"; taskId: string; op: AgenticCodeFileOp }
  | { type: "batch_ready"; taskId: string; taskTitle: string; ops: AgenticCodeFileOp[] }
  | { type: "execution_ready"; outputKind: AgenticCodeOutputKind; paths: string[]; runCommand?: string }
  | { type: "log"; agent: string; message: string }
  | { type: "error"; message: string };

export type AgenticCodeAction =
  | { type: "answer_clarification"; answer: string }
  | { type: "approve_plan" }
  | { type: "reject_plan"; feedback: string }
  | { type: "cancel" }
  | { type: "allow_permission" }
  | { type: "deny_permission" }
  | { type: "approve_batch" }
  | { type: "request_changes"; feedback: string };

// First real wire (see ADR 0003 discussion): one plain, one-shot backend call
// that asks the local model for a clarifying question + a sample code
// snippet. No streaming, no session, no file writes yet — everything else
// in the tool is still mocked.
export type AgenticCodePreview = { question: string; snippet: string };

export async function previewAgenticCode(request: string): Promise<AgenticCodePreview> {
  const res = await fetch(`${API_URL}/agentic-code/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
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
