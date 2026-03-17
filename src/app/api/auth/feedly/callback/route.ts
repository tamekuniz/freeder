import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { sessionOptions, SessionData } from "@/lib/session";
import { exchangeCode } from "@/lib/feedly";
import { setFeedlyTokenWithRefresh } from "@/lib/db";

// Shared logic for both GET (direct redirect) and POST (fetch from frontend)
async function handleCallback(
  code: string | null,
  state: string | null,
  error: string | null,
  requestUrl: string,
  returnJson: boolean
) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );

  if (!session.userId) {
    if (returnJson) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", requestUrl));
  }

  // Handle Feedly error response
  if (error) {
    if (returnJson) {
      return NextResponse.json({ error: `feedly_error: ${error}` }, { status: 400 });
    }
    const errorUrl = new URL("/setup", requestUrl);
    errorUrl.searchParams.set("error", error);
    return NextResponse.redirect(errorUrl);
  }

  // Validate state (CSRF protection)
  if (!state || state !== session.oauthState) {
    if (returnJson) {
      return NextResponse.json({ error: "invalid_state" }, { status: 400 });
    }
    const errorUrl = new URL("/setup", requestUrl);
    errorUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(errorUrl);
  }

  // Clear the state from session
  session.oauthState = undefined;
  await session.save();

  if (!code) {
    if (returnJson) {
      return NextResponse.json({ error: "no_code" }, { status: 400 });
    }
    const errorUrl = new URL("/setup", requestUrl);
    errorUrl.searchParams.set("error", "no_code");
    return NextResponse.redirect(errorUrl);
  }

  try {
    const tokenResponse = await exchangeCode(code);
    setFeedlyTokenWithRefresh(
      session.userId,
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      tokenResponse.expires_in
    );
    if (returnJson) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.redirect(new URL("/", requestUrl));
  } catch (err) {
    console.error("Feedly token exchange failed:", err);
    if (returnJson) {
      return NextResponse.json({ error: "token_exchange_failed" }, { status: 500 });
    }
    const errorUrl = new URL("/setup", requestUrl);
    errorUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(errorUrl);
  }
}

// GET: direct browser redirect (legacy flow)
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  return handleCallback(code, state, error, request.url, false);
}

// POST: called from frontend via fetch (new flow for localhost redirect)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, state, error } = body;
  return handleCallback(code || null, state || null, error || null, request.url, true);
}
