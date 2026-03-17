import type { AIModelInfo, ChatMessage } from "./types";

const GEMINI_MODELS: AIModelInfo[] = [
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", provider: "gemini" },
];

export function listModels(): AIModelInfo[] {
  return GEMINI_MODELS;
}

export async function* streamChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  // Gemini uses "model" instead of "assistant", system goes in systemInstruction
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  const contents = nonSystemMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = { contents };

  if (systemMessages.length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemMessages.map((m) => m.content).join("\n\n") }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
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
      if (!data) continue;
      try {
        const json = JSON.parse(data);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          yield text;
        }
      } catch {
        // skip
      }
    }
  }
}
