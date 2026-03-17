import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import {
  getRssFeeds,
  addRssFeed,
  deleteRssFeed,
  batchUpdateFeedOrder,
} from "@/lib/db";
import { resolveRssFeed } from "@/lib/rss";

export async function GET() {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const feeds = await getRssFeeds(userId);
    return NextResponse.json(feeds);
  } catch (error) {
    console.error("GET /api/rss/feeds error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RSS feeds" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { url, title, category } = await request.json();
    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    let resolved;
    try {
      resolved = await resolveRssFeed(url);
    } catch {
      return NextResponse.json(
        { error: "Could not find RSS feed for the given URL" },
        { status: 404 }
      );
    }

    const feedUrl = resolved.feedUrl;
    const feedTitle = title || resolved.title || feedUrl;

    const feed = await addRssFeed(userId, feedUrl, feedTitle, category);
    return NextResponse.json(feed, { status: 201 });
  } catch (error) {
    console.error("POST /api/rss/feeds error:", error);
    return NextResponse.json(
      { error: "Failed to add RSS feed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { updates } = await request.json() as {
      updates: Array<{ feedId: string; sortOrder: number; category?: string }>;
    };

    if (!updates?.length) {
      return NextResponse.json({ error: "updates array is required" }, { status: 400 });
    }

    batchUpdateFeedOrder(userId, updates);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/rss/feeds error:", error);
    return NextResponse.json({ error: "Failed to update feed order" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { feedId } = await request.json();
    if (!feedId) {
      return NextResponse.json(
        { error: "feedId is required" },
        { status: 400 }
      );
    }

    await deleteRssFeed(userId, feedId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/rss/feeds error:", error);
    return NextResponse.json(
      { error: "Failed to delete RSS feed" },
      { status: 500 }
    );
  }
}
