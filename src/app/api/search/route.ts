import { NextRequest, NextResponse } from "next/server";
import { searchEntries } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const limit = searchParams.get("limit");
  const streamIds = searchParams.get("streamIds");

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    const ids = streamIds ? streamIds.split(",").filter(Boolean) : undefined;
    const results = searchEntries(q.trim(), limit ? Number(limit) : 50, ids);
    return NextResponse.json({
      results: results.map((r) => ({
        entry: JSON.parse(r.data),
        snippet: r.snippet,
        feedTitle: r.feedTitle,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
