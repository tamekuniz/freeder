import { NextRequest, NextResponse } from "next/server";
import { getStream } from "@/lib/feedly";
import { cacheEntries, getCachedEntries } from "@/lib/db";
import { requireAuthUserId } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

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
    const stream = await getStream(auth.userId, streamId, {
      count: count ? Number(count) : 20,
      unreadOnly: unreadOnly === "true",
      continuation: continuation || undefined,
    });
    if (stream.items) {
      cacheEntries(streamId, stream.items);
    }
    return NextResponse.json(stream);
  } catch (error) {
    const cached = getCachedEntries(streamId);
    if (cached) {
      return NextResponse.json({ id: streamId, items: cached });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
