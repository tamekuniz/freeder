import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getUserById, updateUserPassword } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await requireLogin();
    if (auth instanceof NextResponse) return auth;
    const { userId } = auth;

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "現在のパスワードと新しいパスワードを入力してください" },
        { status: 400 }
      );
    }

    if (newPassword.length < 4) {
      return NextResponse.json(
        { error: "パスワードは4文字以上にしてください" },
        { status: 400 }
      );
    }

    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: "ユーザーが見つかりません" },
        { status: 404 }
      );
    }

    if (!verifyPassword(currentPassword, user.password_hash)) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 401 }
      );
    }

    updateUserPassword(userId, hashPassword(newPassword));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
