import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getPreference } from "@/lib/db";
import { streamChatForProvider } from "@/lib/ai";
import type { AIProvider, ChatMessage } from "@/lib/ai";
import { DEFAULT_OLLAMA_URL } from "@/lib/ai/provider-ollama";

export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { provider = "ollama", model, messages } = body as {
    provider?: AIProvider;
    model: string;
    messages: ChatMessage[];
  };

  if (!model || !messages?.length) {
    return NextResponse.json(
      { error: "model and messages are required" },
      { status: 400 }
    );
  }

  const ollamaUrl =
    getPreference("ollama-url", auth.userId) ?? DEFAULT_OLLAMA_URL;

  try {
    const generator = streamChatForProvider(provider, model, messages, ollamaUrl);

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      try {
        for await (const text of generator) {
          await writer.write(encoder.encode(`data: ${text}\n\n`));
        }
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Streaming error";
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect to AI provider";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
