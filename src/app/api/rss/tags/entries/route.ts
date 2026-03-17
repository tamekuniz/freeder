import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { addUserTagToEntry, removeUserTagFromEntry, getEntryUserTags, getEntriesByUserTag } from "@/lib/db";

// GET: エントリのタグ一覧（?entryId=xxx）またはタグの記事一覧（?tagId=xxx&limit=50）
export async function GET(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  try {
    const entryId = request.nextUrl.searchParams.get("entryId");
    const tagId = request.nextUrl.searchParams.get("tagId");
    const limit = request.nextUrl.searchParams.get("limit");

    if (entryId) {
      const tags = getEntryUserTags(userId, entryId);
      return NextResponse.json(tags);
    }
    if (tagId) {
      const entries = getEntriesByUserTag(userId, Number(tagId), limit ? Number(limit) : 50);
      return NextResponse.json(entries);
    }
    return NextResponse.json({ error: "entryId or tagId required" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST: エントリにタグ追加 {entryId, tagId}
export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  try {
    const { entryId, tagId } = await request.json();
    if (!entryId || !tagId) {
      return NextResponse.json({ error: "entryId and tagId required" }, { status: 400 });
    }
    addUserTagToEntry(userId, entryId, tagId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to add tag" }, { status: 500 });
  }
}

// DELETE: エントリからタグ削除 {entryId, tagId}
export async function DELETE(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  try {
    const { entryId, tagId } = await request.json();
    if (!entryId || !tagId) {
      return NextResponse.json({ error: "entryId and tagId required" }, { status: 400 });
    }
    removeUserTagFromEntry(userId, entryId, tagId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to remove tag" }, { status: 500 });
  }
}
