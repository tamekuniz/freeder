import type { AIModelInfo, ChatMessage } from "./types";

const OPENAI_MODELS: AIModelInfo[] = [
  { id: "gpt-4o", name: "GPT-4o", provider: "chatgpt" },
  { id: "gpt-4o-mini", name: "GPT-4o mini", provider: "chatgpt" },
  { id: "gpt-4.1", name: "GPT-4.1", provider: "chatgpt" },
  { id: "gpt-4.1-mini", name: "GPT-4.1 mini", provider: "chatgpt" },
];

export function listModels(): AIModelInfo[] {
  return OPENAI_MODELS;
}

export async function* streamChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${text}`);
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
      if (data === "[DONE]") return;
      if (!data) continue;
      try {
        const json = JSON.parse(data);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }
      } catch {
        // skip
      }
    }
  }
}
