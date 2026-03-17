import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getEntryAiTags } from "@/lib/db";

// GET ?entryId=xxx
export async function GET(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  try {
    const tags = getEntryAiTags(userId, entryId);
    return NextResponse.json(tags);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch AI tags" }, { status: 500 });
  }
}
