import { NextRequest, NextResponse } from "next/server";
import { markAsRead, keepUnread, getUnreadCounts, FeedlyTokenNotFoundError } from "@/lib/feedly";
import { cacheUnreadCounts, getCachedUnreadCounts, decrementUnreadCount, incrementUnreadCount } from "@/lib/db";
import { requireAuthUserId } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const counts = await getUnreadCounts(auth.userId);
    if (counts.unreadcounts) {
      // Compare with local cache: keep the lower count per feed
      // (local decrements from markAsRead may not be reflected in Feedly yet)
      const localCounts = getCachedUnreadCounts() || {};
      const countMap: Record<string, number> = {};
      for (const c of counts.unreadcounts) {
        const localCount = localCounts[c.id];
        // If we have a local count that's lower, Feedly hasn't caught up yet — keep ours
        if (localCount != null && localCount < c.count) {
          c.count = localCount;
        }
        countMap[c.id] = c.count;
      }
      cacheUnreadCounts(countMap);
    }
    return NextResponse.json(counts);
  } catch (error) {
    if (error instanceof FeedlyTokenNotFoundError) {
      return NextResponse.json({ error: "feedly token not configured" }, { status: 403 });
    }
    const cached = getCachedUnreadCounts();
    if (cached) {
      const unreadcounts = Object.entries(cached).map(([id, count]) => ({
        id,
        count,
        updated: Date.now(),
      }));
      return NextResponse.json({ unreadcounts }, {
        headers: { "X-Data-Source": "cache" },
      });
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
    const { action, entryIds, feedId } = body;

    if (!entryIds || !Array.isArray(entryIds)) {
      return NextResponse.json(
        { error: "entryIds array is required" },
        { status: 400 }
      );
    }

    if (action === "markAsRead") {
      await markAsRead(auth.userId, entryIds);
      // Update local cache so reload reflects the change immediately
      if (feedId) {
        decrementUnreadCount(feedId, entryIds.length);
      }
    } else if (action === "keepUnread") {
      await keepUnread(auth.userId, entryIds);
      if (feedId) {
        incrementUnreadCount(feedId, entryIds.length);
      }
    } else {
      return NextResponse.json(
        { error: "action must be 'markAsRead' or 'keepUnread'" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof FeedlyTokenNotFoundError) {
      return NextResponse.json({ error: "feedly token not configured" }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
