import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { verifyPassword } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username?.trim() || !password) {
      return NextResponse.json(
        { ok: false, error: "ユーザー名とパスワードを入力してください" },
        { status: 400 }
      );
    }

    const user = getUserByUsername(username.trim());
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json(
        { ok: false, error: "ユーザー名またはパスワードが違います" },
        { status: 401 }
      );
    }

    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions
    );
    session.userId = user.id;
    session.username = user.username;
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
