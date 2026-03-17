import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { NextResponse } from "next/server";
import { sessionOptions, SessionData } from "@/lib/session";
import { getAuthorizationUrl } from "@/lib/feedly";
import crypto from "crypto";

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // CSRF protection: generate random state and store in session
  const state = crypto.randomBytes(16).toString("hex");
  session.oauthState = state;
  await session.save();

  const authUrl = getAuthorizationUrl(state);
  return NextResponse.redirect(authUrl);
}
