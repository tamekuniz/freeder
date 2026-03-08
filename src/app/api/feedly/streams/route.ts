import { NextRequest, NextResponse } from "next/server";
import { getStream } from "@/lib/feedly";
import { cacheEntries, getCachedEntries } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const streamId = searchParams.get("streamId");
  const count = searchParams.get("count");
  const unreadOnly = searchParams.get("unreadOnly");
  const continuation = searchParams.get("continuation");

  if (!streamId) {
    return NextResponse.json(
      { error: "streamId is required" },
      { status: 400 }
    );
  }

  try {
    const stream = await getStream(streamId, {
      count: count ? Number(count) : 20,
      unreadOnly: unreadOnly === "true",
      continuation: continuation || undefined,
    });
    // Cache entries to SQLite on success
    if (stream.items) {
      cacheEntries(streamId, stream.items);
    }
    return NextResponse.json(stream);
  } catch (error) {
    // Offline fallback: try SQLite cache
    const cached = getCachedEntries(streamId);
    if (cached) {
      return NextResponse.json({ id: streamId, items: cached });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
