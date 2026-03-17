export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function listModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) {
    throw new Error(`Ollama API error: ${res.status}`);
  }
  const data = await res.json();
  return data.models || [];
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
