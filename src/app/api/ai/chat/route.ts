import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getPreference } from "@/lib/db";
import { streamChat, ChatMessage, DEFAULT_OLLAMA_URL } from "@/lib/ollama";

export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { model, messages } = body as {
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
    const generator = streamChat(ollamaUrl, model, messages);

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
          error instanceof Error ? error.message : "Ollama streaming error";
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
      error instanceof Error ? error.message : "Failed to connect to Ollama";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
