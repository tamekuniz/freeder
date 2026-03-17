import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getRssFeeds, addRssFeed } from "@/lib/db";
import { parseOPML } from "@/lib/rss";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    let opmlText: string;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file provided" },
          { status: 400 }
        );
      }
      opmlText = await file.text();
    } else {
      const body = await request.json();
      if (!body.opml) {
        return NextResponse.json(
          { error: "opml field is required" },
          { status: 400 }
        );
      }
      opmlText = body.opml;
    }

    const feedItems = parseOPML(opmlText);

    // Get existing feeds to check for duplicates
    const existingFeeds = getRssFeeds(userId);
    const existingUrls = new Set(existingFeeds.map((f) => f.feed_url));

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of feedItems) {
      if (existingUrls.has(item.feedUrl)) {
        skipped++;
        continue;
      }

      try {
        addRssFeed(userId, item.feedUrl, item.title || item.feedUrl, undefined, item.category);
        imported++;
      } catch (error) {
        // Handle UNIQUE constraint violations (duplicate feeds)
        const message =
          error instanceof Error ? error.message : String(error);
        if (
          message.includes("UNIQUE") ||
          message.includes("unique") ||
          message.includes("duplicate")
        ) {
          skipped++;
        } else {
          errors.push(`${item.feedUrl}: ${message}`);
        }
      }
    }

    return NextResponse.json({ imported, skipped, errors });
  } catch (error) {
    console.error("POST /api/rss/import error:", error);
    return NextResponse.json(
      { error: "Failed to import OPML" },
      { status: 500 }
    );
  }
}
