import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { findLookalikes, getEntryAiTags } from "@/lib/db";

// GET ?entryId=xxx&minCommon=2&limit=10
export async function GET(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  const minCommon = Number(request.nextUrl.searchParams.get("minCommon") || "2");
  const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

  try {
    const aiTags = getEntryAiTags(userId, entryId);
    const results = findLookalikes(userId, entryId, minCommon, limit);
    return NextResponse.json({ aiTags, results });
  } catch (error) {
    return NextResponse.json({ error: "Lookalike search failed" }, { status: 500 });
  }
}
