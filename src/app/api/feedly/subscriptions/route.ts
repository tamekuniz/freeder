import { NextResponse } from "next/server";
import { getSubscriptions } from "@/lib/feedly";
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
      return NextResponse.json(cached);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
