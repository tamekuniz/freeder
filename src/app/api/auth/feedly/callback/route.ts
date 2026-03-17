import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { sessionOptions, SessionData } from "@/lib/session";
import { exchangeCode } from "@/lib/feedly";
import { setFeedlyTokenWithRefresh } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  // Handle Feedly error response
  if (error) {
    const errorUrl = new URL("/setup", request.url);
    errorUrl.searchParams.set("error", error);
    return NextResponse.redirect(errorUrl);
  }

  // Validate state (CSRF protection)
  if (!state || state !== session.oauthState) {
    const errorUrl = new URL("/setup", request.url);
    errorUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(errorUrl);
  }

  // Clear the state from session
  session.oauthState = undefined;
  await session.save();

  if (!code) {
    const errorUrl = new URL("/setup", request.url);
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
    return NextResponse.redirect(new URL("/", request.url));
  } catch (err) {
    const errorUrl = new URL("/setup", request.url);
    console.error("Feedly token exchange failed:", err);
    errorUrl.searchParams.set("error", "token_exchange_failed");
    return NextResponse.redirect(errorUrl);
  }
}
