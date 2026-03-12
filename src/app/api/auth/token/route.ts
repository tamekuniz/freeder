import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { setFeedlyToken, getFeedlyToken } from "@/lib/db";
import { validateToken } from "@/lib/feedly";

function getEnvToken(): string | null {
  const t = process.env.FEEDLY_ACCESS_TOKEN;
  return t && t !== "your_feedly_access_token_here" ? t : null;
}

export async function GET() {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }
  const token = getFeedlyToken(session.userId);
  return NextResponse.json({ hasToken: !!token, hasEnvToken: !!getEnvToken() });
}

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  );
  if (!session.userId) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { token, useEnv } = body;

    if (useEnv) {
      const envToken = getEnvToken();
      if (!envToken) {
        return NextResponse.json(
          { ok: false, error: "サーバーにトークンが設定されていません" },
          { status: 400 }
        );
      }
      setFeedlyToken(session.userId, envToken);
      return NextResponse.json({ ok: true });
    }

    if (!token?.trim()) {
      return NextResponse.json(
        { ok: false, error: "トークンを入力してください" },
        { status: 400 }
      );
    }

    const result = await validateToken(token.trim());
    if (!result.valid) {
      return NextResponse.json(
        { ok: false, error: "無効なトークンです。確認してください。" },
        { status: 400 }
      );
    }

    setFeedlyToken(session.userId, token.trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
