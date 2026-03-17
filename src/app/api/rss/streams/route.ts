import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getCachedEntries } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const streamIds = searchParams.getAll("streamId");

    if (streamIds.length === 0) {
      return NextResponse.json(
        { error: "streamId is required" },
        { status: 400 }
      );
    }

    for (const id of streamIds) {
      if (!id.startsWith("rss:")) {
        return NextResponse.json(
          { error: "streamId must start with 'rss:'" },
          { status: 400 }
        );
      }
    }

    // Fetch entries from all requested streams and merge
    const allEntries: unknown[] = [];
    for (const id of streamIds) {
      const entries = await getCachedEntries(userId, id);
      if (entries) allEntries.push(...entries);
    }

    // Sort by published date descending
    allEntries.sort((a, b) => {
      const ta = (a as { published?: number }).published || 0;
      const tb = (b as { published?: number }).published || 0;
      return tb - ta;
    });

    return NextResponse.json({
      id: streamIds.length === 1 ? streamIds[0] : `folder:${streamIds.length}`,
      items: allEntries,
    });
  } catch (error) {
    console.error("GET /api/rss/streams error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stream" },
      { status: 500 }
    );
  }
}
