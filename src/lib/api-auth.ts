import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import { sessionOptions, SessionData } from "./session";
import { getFeedlyToken } from "./db";

export interface AuthContext {
  userId: number;
  username: string;
  feedlyToken: string;
}

export async function requireAuth(): Promise<AuthContext | NextResponse> {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  const token = getFeedlyToken(session.userId);
  if (!token) {
    return NextResponse.json(
      { error: "feedly token not configured" },
      { status: 403 }
    );
  }
  return {
    userId: session.userId,
    username: session.username!,
    feedlyToken: token,
  };
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
