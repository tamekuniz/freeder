import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getCachedEntries } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("streamId");

    if (!streamId) {
      return NextResponse.json(
        { error: "streamId is required" },
        { status: 400 }
      );
    }

    if (!streamId.startsWith("rss:")) {
      return NextResponse.json(
        { error: "streamId must start with 'rss:'" },
        { status: 400 }
      );
    }

    const entries = await getCachedEntries(streamId);

    return NextResponse.json({
      id: streamId,
      items: entries,
    });
  } catch (error) {
    console.error("GET /api/rss/streams error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stream" },
      { status: 500 }
    );
  }
}
