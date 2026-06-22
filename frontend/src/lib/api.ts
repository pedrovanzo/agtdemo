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
