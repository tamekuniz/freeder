import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { decrementUnreadCount, incrementUnreadCount } from "@/lib/db";

export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  try {
    const { action, entryIds, feedId } = await request.json();

    if (!action || !entryIds || !Array.isArray(entryIds)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // RSSエントリの既読/未読はローカルDBのunread_countsのみで管理
    if (feedId) {
      if (action === "markAsRead") {
        decrementUnreadCount(feedId, entryIds.length);
      } else if (action === "keepUnread") {
        incrementUnreadCount(feedId, entryIds.length);
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
