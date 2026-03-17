import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import {
  getRssFeeds,
  cacheEntries,
  getCachedEntries,
  cacheUnreadCounts,
  updateRssFeedLastFetched,
  updateRssFeedMeta,
} from "@/lib/db";
import { fetchAndParseFeed, convertToFeedlyEntries } from "@/lib/rss";

export async function POST(_request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const feeds = await getRssFeeds(userId);
    let crawled = 0;
    let newEntries = 0;
    const errors: string[] = [];

    for (const feed of feeds) {
      try {
        const parsed = await fetchAndParseFeed(feed.feed_url);
        const entries = convertToFeedlyEntries(
          feed.id,
          parsed.items,
          parsed.title,
          parsed.siteUrl
        );

        // Get existing entries to determine which are new
        const existingEntries = getCachedEntries(feed.id);
        const existingIds = new Set(
          (existingEntries || []).map((e) => (e as { id: string }).id)
        );
        const newItems = entries.filter((e) => !existingIds.has(e.id));

        // Cache all entries
        cacheEntries(feed.id, entries);

        // Add new entry count to unread counts
        if (newItems.length > 0) {
          cacheUnreadCounts({ [feed.id]: newItems.length });
          newEntries += newItems.length;
        }

        // Update last fetched timestamp
        updateRssFeedLastFetched(feed.id);

        // Auto-adjust polling interval based on average post frequency
        if (entries.length >= 2) {
          const timestamps = entries
            .map((e) => e.published ?? 0)
            .filter((t) => t > 0)
            .sort((a, b) => b - a);

          if (timestamps.length >= 2) {
            const intervals: number[] = [];
            for (let i = 0; i < timestamps.length - 1; i++) {
              intervals.push(timestamps[i] - timestamps[i + 1]);
            }
            const avgIntervalMs =
              intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const avgIntervalMinutes = Math.round(avgIntervalMs / 1000 / 60);

            updateRssFeedMeta(
              feed.id,
              undefined,
              undefined,
              undefined,
              avgIntervalMinutes
            );
          }
        }

        crawled++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        errors.push(`${feed.feed_url}: ${message}`);
      }
    }

    return NextResponse.json({ crawled, errors, newEntries });
  } catch (error) {
    console.error("POST /api/rss/crawl error:", error);
    return NextResponse.json(
      { error: "Failed to crawl RSS feeds" },
      { status: 500 }
    );
  }
}
