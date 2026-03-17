export type AIProvider = "ollama" | "claude" | "chatgpt" | "gemini";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIModelInfo {
  id: string;
  name: string;
  provider: AIProvider;
}

export interface ProviderConfig {
  provider: AIProvider;
  label: string;
  available: boolean;
}
