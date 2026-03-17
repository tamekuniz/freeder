import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { resolveRssFeed } from "@/lib/rss";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;

    const { url } = await request.json();
    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    const feeds: { url: string; title?: string }[] = [];

    try {
      const resolved = await resolveRssFeed(url);
      feeds.push({ url: resolved.feedUrl, title: resolved.title || undefined });
    } catch {
      // No feed found — return empty list
    }

    return NextResponse.json({ feeds });
  } catch (error) {
    console.error("POST /api/rss/discover error:", error);
    return NextResponse.json(
      { error: "Failed to discover RSS feeds" },
      { status: 500 }
    );
  }
}
