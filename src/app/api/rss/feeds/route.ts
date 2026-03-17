import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import {
  getRssFeeds,
  addRssFeed,
  deleteRssFeed,
} from "@/lib/db";
import {
  fetchAndParseFeed,
  discoverFeedUrl,
  discoverFeedUrlAdvanced,
} from "@/lib/rss";

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

    // Try to parse the URL directly as an RSS feed
    let feedUrl = url;
    let feedTitle = title;

    try {
      const parsed = await fetchAndParseFeed(url);
      feedUrl = url;
      if (!feedTitle) feedTitle = parsed.title;
    } catch {
      // Not a direct feed URL — try to discover the feed
      try {
        const discovered = await discoverFeedUrl(url);
        if (discovered) {
          feedUrl = discovered;
          if (!feedTitle) {
            try {
              const parsed = await fetchAndParseFeed(feedUrl);
              feedTitle = parsed.title;
            } catch {
              // Use URL as fallback title
            }
          }
        } else {
          throw new Error("No feed found");
        }
      } catch {
        // Try advanced discovery as last resort
        const discoveredAdvanced = await discoverFeedUrlAdvanced(url);
        if (discoveredAdvanced) {
          feedUrl = discoveredAdvanced;
          if (!feedTitle) {
            try {
              const parsed = await fetchAndParseFeed(feedUrl);
              feedTitle = parsed.title;
            } catch {
              // Use URL as fallback title
            }
          }
        } else {
          return NextResponse.json(
            { error: "Could not find RSS feed for the given URL" },
            { status: 404 }
          );
        }
      }
    }

    if (!feedTitle) feedTitle = feedUrl;

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
