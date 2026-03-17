import { NextRequest, NextResponse } from "next/server";
import { markAsRead, keepUnread, getUnreadCounts } from "@/lib/feedly";
import { cacheUnreadCounts, getCachedUnreadCounts } from "@/lib/db";
import { requireAuthUserId } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const counts = await getUnreadCounts(auth.userId);
    if (counts.unreadcounts) {
      const countMap: Record<string, number> = {};
      for (const c of counts.unreadcounts) {
        countMap[c.id] = c.count;
      }
      cacheUnreadCounts(countMap);
    }
    return NextResponse.json(counts);
  } catch (error) {
    const cached = getCachedUnreadCounts();
    if (cached) {
      const unreadcounts = Object.entries(cached).map(([id, count]) => ({
        id,
        count,
        updated: Date.now(),
      }));
      return NextResponse.json({ unreadcounts });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { action, entryIds } = body;

    if (!entryIds || !Array.isArray(entryIds)) {
      return NextResponse.json(
        { error: "entryIds array is required" },
        { status: 400 }
      );
    }

    if (action === "markAsRead") {
      await markAsRead(auth.userId, entryIds);
    } else if (action === "keepUnread") {
      await keepUnread(auth.userId, entryIds);
    } else {
      return NextResponse.json(
        { error: "action must be 'markAsRead' or 'keepUnread'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
