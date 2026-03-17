import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { getFeedlyToken, getRssFeeds } from "@/lib/db";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (!session.userId) {
    return NextResponse.json({ ok: false });
  }

  const token = getFeedlyToken(session.userId);
  const rssFeeds = getRssFeeds(session.userId);

  return NextResponse.json({
    ok: true,
    userId: session.userId,
    username: session.username,
    hasToken: !!token,
    hasRssFeeds: rssFeeds.length > 0,
  });
}
