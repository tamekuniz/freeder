import type { AIModelInfo, ChatMessage } from "./types";

const CLAUDE_MODELS: AIModelInfo[] = [
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", provider: "claude" },
  { id: "claude-haiku-4-20250414", name: "Claude Haiku 4", provider: "claude" },
];

export function listModels(): AIModelInfo[] {
  return CLAUDE_MODELS;
}

export async function* streamChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  // Anthropic requires system message as separate parameter
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
    max_tokens: 4096,
    stream: true,
  };

  if (systemMessages.length > 0) {
    body.system = systemMessages.map((m) => m.content).join("\n\n");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        if (json.type === "content_block_delta" && json.delta?.text) {
          yield json.delta.text;
        }
      } catch {
        // skip
      }
    }
  }
}
