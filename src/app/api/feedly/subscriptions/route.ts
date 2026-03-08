import { NextResponse } from "next/server";
import { getSubscriptions } from "@/lib/feedly";
import { cacheSubscriptions, getCachedSubscriptions } from "@/lib/db";

export async function GET() {
  try {
    const subscriptions = await getSubscriptions();
    // Cache to SQLite on success
    cacheSubscriptions(subscriptions);
    return NextResponse.json(subscriptions);
  } catch (error) {
    // Offline fallback: try SQLite cache
    const cached = getCachedSubscriptions();
    if (cached) {
      return NextResponse.json(cached);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
