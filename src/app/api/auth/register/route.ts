import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import {
  createUser,
  getUserByUsername,
  getUserCount,
  setFeedlyToken,
  migratePreferencesToUser,
} from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username?.trim() || !password) {
      return NextResponse.json(
        { ok: false, error: "ユーザー名とパスワードを入力してください" },
        { status: 400 }
      );
    }
    if (password.length < 4) {
      return NextResponse.json(
        { ok: false, error: "パスワードは4文字以上にしてください" },
        { status: 400 }
      );
    }

    const existing = getUserByUsername(username.trim());
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "このユーザー名は既に使われています" },
        { status: 409 }
      );
    }

    const isFirst = getUserCount() === 0;
    const userId = createUser(username.trim(), hashPassword(password));

    // First user: migrate legacy .env token and shared preferences
    if (isFirst) {
      const envToken = process.env.FEEDLY_ACCESS_TOKEN;
      if (envToken && envToken !== "your_feedly_access_token_here") {
        setFeedlyToken(userId, envToken);
      }
      migratePreferencesToUser(userId);
    }

    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions
    );
    session.userId = userId;
    session.username = username.trim();
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
