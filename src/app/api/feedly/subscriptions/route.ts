import { NextResponse } from "next/server";
import { getSubscriptions, FeedlyTokenNotFoundError } from "@/lib/feedly";
import { cacheSubscriptions, getCachedSubscriptions } from "@/lib/db";
import { requireAuthUserId } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuthUserId();
  if (auth instanceof NextResponse) return auth;

  try {
    const subscriptions = await getSubscriptions(auth.userId);
    cacheSubscriptions(subscriptions);
    return NextResponse.json(subscriptions);
  } catch (error) {
    const cached = getCachedSubscriptions();
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Data-Source": "cache" },
      });
    }
    if (error instanceof FeedlyTokenNotFoundError) {
      return NextResponse.json({ error: "feedly token not configured" }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
