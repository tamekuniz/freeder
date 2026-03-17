import type { AIModelInfo, ChatMessage } from "./types";

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export async function listModels(baseUrl: string): Promise<AIModelInfo[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
  const data = await res.json();
  return (data.models || []).map((m: { name: string }) => ({
    id: m.name,
    name: m.name,
    provider: "ollama" as const,
  }));
}

export async function* streamChat(
  baseUrl: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama chat error ${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.message?.content) {
          yield json.message.content;
        }
      } catch {
        // Skip malformed JSON chunks
      }
    }
  }
}
