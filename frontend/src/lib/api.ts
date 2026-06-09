const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type LogMessage = { type: "log"; message: string };
export type ResultMessage = { type: "result"; data: string };
export type ErrorMessage = { type: "error"; message: string };
export type PipelineEvent = LogMessage | ResultMessage | ErrorMessage;

export async function streamResearch(
  topic: string,
  onEvent: (e: PipelineEvent) => void
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/research`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ topic }),
    });

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({ detail: "Unknown error" }));
      const errorMsg = err.detail ?? `HTTP ${res.status}`;
      onEvent({ type: "error", message: `Connection error: ${errorMsg}` });
      throw new Error(errorMsg);
    }

    onEvent({ type: "log", message: "✓ Connected to backend" });

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
