const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type PipelineEvent =
  | { event: "start"; agent: string }
  | { event: "complete"; article: string };

export async function streamResearch(
  topic: string,
  token: string,
  onEvent: (e: PipelineEvent) => void
): Promise<void> {
  const res = await fetch(`${API_URL}/research`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Token": token,
    },
    body: JSON.stringify({ topic }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
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
      } catch {
        // malformed SSE line — skip
      }
    }
  }
}
