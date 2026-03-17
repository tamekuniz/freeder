import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { decrementUnreadCount, incrementUnreadCount, setEntryStarred, setEntryReadStatus } from "@/lib/db";

export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { action, entryIds, feedId } = await request.json();

    if (!action || !entryIds || !Array.isArray(entryIds)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // RSSエントリの既読/未読をエントリデータとunread_countsの両方で管理
    if (action === "markAsRead") {
      setEntryReadStatus(entryIds, false);
      if (feedId) decrementUnreadCount(feedId, entryIds.length);
    } else if (action === "keepUnread") {
      setEntryReadStatus(entryIds, true);
      if (feedId) incrementUnreadCount(feedId, entryIds.length);
    }

    // スター/アンスターはエントリのtagsフィールドを更新
    if (action === "star" || action === "unstar") {
      const starred = action === "star";
      for (const entryId of entryIds) {
        setEntryStarred(entryId, starred);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
