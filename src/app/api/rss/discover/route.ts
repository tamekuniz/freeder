import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { discoverFeedUrl, discoverFeedUrlAdvanced } from "@/lib/rss";

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

    // Try standard discovery first
    try {
      const discovered = await discoverFeedUrl(url);
      if (discovered) {
        feeds.push({ url: discovered });
      }
    } catch {
      // Ignore errors from standard discovery
    }

    // If nothing found, try advanced discovery
    if (feeds.length === 0) {
      try {
        const discoveredAdvanced = await discoverFeedUrlAdvanced(url);
        if (discoveredAdvanced) {
          feeds.push({ url: discoveredAdvanced });
        }
      } catch {
        // Ignore errors from advanced discovery
      }
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
