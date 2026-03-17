import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import { sessionOptions, SessionData } from "./session";

// Auth check that provides userId for feedly functions (with auto-refresh support)
// Token existence is checked by getValidToken() inside feedlyFetch(), avoiding double DB access.
export async function requireAuthUserId(): Promise<{ userId: number; username: string } | NextResponse> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  return { userId: session.userId, username: session.username! };
}

// Auth check without requiring Feedly token (for /api/auth/me etc.)
export async function requireLogin(): Promise<
  { userId: number; username: string } | NextResponse
> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  return { userId: session.userId, username: session.username! };
}
