import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getPreference } from "@/lib/db";
import { listModels } from "@/lib/ollama";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export async function GET(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  const ollamaUrl =
    getPreference("ollama-url", auth.userId) ?? DEFAULT_OLLAMA_URL;

  try {
    const models = await listModels(ollamaUrl);
    return NextResponse.json({ models });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to Ollama";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
