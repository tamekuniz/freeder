import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { createUserTag, deleteUserTag, getUserTags } from "@/lib/db";

// GET: ユーザータグ一覧
export async function GET() {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  try {
    const tags = getUserTags(userId);
    return NextResponse.json(tags);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

// POST: タグ作成 {name, color?}
export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  try {
    const { name, color } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const tag = createUserTag(userId, name.trim(), color);
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create tag";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: タグ削除 {tagId}
export async function DELETE(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  try {
    const { tagId } = await request.json();
    if (!tagId) {
      return NextResponse.json({ error: "tagId is required" }, { status: 400 });
    }
    deleteUserTag(userId, tagId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 });
  }
}
