import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getExtractedContent, saveExtractedContent, updateFtsWithExtractedContent } from "@/lib/db";
import { extractArticle } from "@/lib/extract";

export async function GET(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "url parameter required" },
      { status: 400 }
    );
  }

  // Check cache first (unless force refresh)
  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force) {
    const cached = getExtractedContent(url);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  const data = await extractArticle(url);
  if (!data) {
    return NextResponse.json(
      { error: "Could not extract article content" },
      { status: 422 }
    );
  }

  // Cache the extracted content
  saveExtractedContent(url, data);

  // Update FTS index with the richer extracted text
  if (data.textContent) {
    updateFtsWithExtractedContent(url, data.textContent);
  }

  return NextResponse.json(data);
}
