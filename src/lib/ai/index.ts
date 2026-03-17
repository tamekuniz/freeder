import type { AIProvider, AIModelInfo, ChatMessage, ProviderConfig } from "./types";
import * as ollama from "./provider-ollama";
import * as claude from "./provider-claude";
import * as openai from "./provider-openai";
import * as gemini from "./provider-gemini";

export type { AIProvider, AIModelInfo, ChatMessage, ProviderConfig };

const PROVIDER_LABELS: Record<AIProvider, string> = {
  ollama: "Ollama",
  claude: "Claude",
  chatgpt: "ChatGPT",
  gemini: "Gemini",
};

/** Resolve an API key from explicit keys map, then env var fallback */
export function resolveApiKey(
  provider: AIProvider,
  apiKeys?: Partial<Record<AIProvider, string>>
): string | undefined {
  const fromKeys = apiKeys?.[provider];
  if (fromKeys) return fromKeys;
  switch (provider) {
    case "claude": return process.env.ANTHROPIC_API_KEY;
    case "chatgpt": return process.env.OPENAI_API_KEY;
    case "gemini": return process.env.GEMINI_API_KEY;
    default: return undefined;
  }
}

export async function getAvailableProviders(
  ollamaUrl?: string,
  apiKeys?: Partial<Record<AIProvider, string>>
): Promise<ProviderConfig[]> {
  const providers: ProviderConfig[] = [];

  // Claude
  if (resolveApiKey("claude", apiKeys)) {
    providers.push({ provider: "claude", label: PROVIDER_LABELS.claude, available: true });
  }

  // ChatGPT
  if (resolveApiKey("chatgpt", apiKeys)) {
    providers.push({ provider: "chatgpt", label: PROVIDER_LABELS.chatgpt, available: true });
  }

  // Gemini
  if (resolveApiKey("gemini", apiKeys)) {
    providers.push({ provider: "gemini", label: PROVIDER_LABELS.gemini, available: true });
  }

  // Ollama (check if reachable)
  try {
    const url = ollamaUrl || ollama.DEFAULT_OLLAMA_URL;
    await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    providers.push({ provider: "ollama", label: PROVIDER_LABELS.ollama, available: true });
  } catch {
    // Ollama not reachable, skip
  }

  return providers;
}

export async function getModelsForProvider(
  provider: AIProvider,
  ollamaUrl?: string
): Promise<AIModelInfo[]> {
  switch (provider) {
    case "ollama":
      return ollama.listModels(ollamaUrl || ollama.DEFAULT_OLLAMA_URL);
    case "claude":
      return claude.listModels();
    case "chatgpt":
      return openai.listModels();
    case "gemini":
      return gemini.listModels();
    default:
      return [];
  }
}

export async function* streamChatForProvider(
  provider: AIProvider,
  model: string,
  messages: ChatMessage[],
  ollamaUrl?: string,
  signal?: AbortSignal,
  apiKeys?: Partial<Record<AIProvider, string>>
): AsyncGenerator<string> {
  switch (provider) {
    case "ollama":
      yield* ollama.streamChat(ollamaUrl || ollama.DEFAULT_OLLAMA_URL, model, messages, signal);
      break;
    case "claude": {
      const key = resolveApiKey("claude", apiKeys);
      if (!key) throw new Error("Claude API key not configured");
      yield* claude.streamChat(key, model, messages, signal);
      break;
    }
    case "chatgpt": {
      const key = resolveApiKey("chatgpt", apiKeys);
      if (!key) throw new Error("OpenAI API key not configured");
      yield* openai.streamChat(key, model, messages, signal);
      break;
    }
    case "gemini": {
      const key = resolveApiKey("gemini", apiKeys);
      if (!key) throw new Error("Gemini API key not configured");
      yield* gemini.streamChat(key, model, messages, signal);
      break;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
