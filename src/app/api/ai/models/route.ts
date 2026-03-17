import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getPreference } from "@/lib/db";
import { getAvailableProviders, getModelsForProvider } from "@/lib/ai";
import { DEFAULT_OLLAMA_URL } from "@/lib/ai/provider-ollama";

export async function GET() {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  const ollamaUrl =
    getPreference("ollama-url", auth.userId) ?? DEFAULT_OLLAMA_URL;

  const apiKeys = {
    claude: getPreference("claude-api-key", auth.userId) || undefined,
    chatgpt: getPreference("chatgpt-api-key", auth.userId) || undefined,
    gemini: getPreference("gemini-api-key", auth.userId) || undefined,
  };

  try {
    const providers = await getAvailableProviders(ollamaUrl, apiKeys);

    const allModels = await Promise.all(
      providers.map(async (p) => {
        try {
          return await getModelsForProvider(p.provider, ollamaUrl);
        } catch {
          return [];
        }
      })
    );

    return NextResponse.json({
      providers,
      models: allModels.flat(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
