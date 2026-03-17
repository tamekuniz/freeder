import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import {
  getRssFeeds,
  getRssFeedById,
  cacheEntries,
  getCachedEntries,
  cacheUnreadCounts,
  updateRssFeedLastFetched,
  updateRssFeedMeta,
  getExtractedContent,
  saveExtractedContent,
  updateFtsWithExtractedContent,
} from "@/lib/db";
import type { RssFeed } from "@/lib/db";
import { fetchAndParseFeed, convertToFeedlyEntries } from "@/lib/rss";
import { extractArticle } from "@/lib/extract";

const CONCURRENCY = 5;
const EXTRACT_CONCURRENCY = 3;

/**
 * Auto-extract full text for new articles.
 * Fail-open: extraction failures are silently ignored.
 */
async function autoExtractEntries(
  entries: { id: string; alternate?: { href: string }[]; title?: string }[]
): Promise<number> {
  let extracted = 0;

  for (let i = 0; i < entries.length; i += EXTRACT_CONCURRENCY) {
    const chunk = entries.slice(i, i + EXTRACT_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async (entry) => {
        const url = entry.alternate?.[0]?.href;
        if (!url) return;

        // Skip if already extracted
        if (getExtractedContent(url)) return;

        const data = await extractArticle(url);
        if (!data) return;

        saveExtractedContent(url, data);
        if (data.textContent) {
          updateFtsWithExtractedContent(url, data.textContent);
        }
        extracted++;
      })
    );
  }

  return extracted;
}

async function crawlFeed(feed: RssFeed): Promise<{ newEntries: number; extracted: number }> {
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

      updateRssFeedMeta(feed.id, { avgPostInterval: avgIntervalMinutes });
    }
  }

  // Auto-extract full text for new articles
  const extracted = await autoExtractEntries(
    newItems as { id: string; alternate?: { href: string }[]; title?: string }[]
  );

  return { newEntries: newItems.length, extracted };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const body = await request.json().catch(() => ({}));
    const targetFeedId = body.feedId;

    // 特定フィードのみ or 全フィード
    let feeds: RssFeed[];
    if (targetFeedId) {
      const feed = getRssFeedById(targetFeedId);
      feeds = feed ? [feed] : [];
    } else {
      feeds = getRssFeeds(userId);
    }

    let crawled = 0;
    let newEntries = 0;
    let totalExtracted = 0;
    const errors: string[] = [];

    // フィードを CONCURRENCY 個ずつのチャンクに分けて並列処理
    for (let i = 0; i < feeds.length; i += CONCURRENCY) {
      const chunk = feeds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((feed) => crawlFeed(feed))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        if (result.status === "fulfilled") {
          crawled++;
          newEntries += result.value.newEntries;
          totalExtracted += result.value.extracted;
        } else {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          errors.push(`${chunk[j].feed_url}: ${message}`);
        }
      }
    }

    return NextResponse.json({ crawled, errors, newEntries, extracted: totalExtracted });
  } catch (error) {
    console.error("POST /api/rss/crawl error:", error);
    return NextResponse.json(
      { error: "Failed to crawl RSS feeds" },
      { status: 500 }
    );
  }
}
