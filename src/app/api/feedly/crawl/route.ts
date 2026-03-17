import { NextResponse } from "next/server";
import { getSubscriptions, getStream } from "@/lib/feedly";
import { cacheEntries } from "@/lib/db";
import { requireAuthUserId } from "@/lib/api-auth";

export async function POST() {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const subscriptions = await getSubscriptions(auth.userId);
    let totalCached = 0;
    let feedsDone = 0;

    for (const sub of subscriptions) {
      try {
        const stream = await getStream(auth.userId, sub.id, { count: 50 });
        if (stream.items && stream.items.length > 0) {
          cacheEntries(sub.id, stream.items);
          totalCached += stream.items.length;
        }
        feedsDone++;
      } catch {
        // Skip feeds that fail (e.g. rate limited) and continue
        feedsDone++;
      }
    }

    return NextResponse.json({
      ok: true,
      feeds: feedsDone,
      totalFeeds: subscriptions.length,
      articles: totalCached,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawl failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
