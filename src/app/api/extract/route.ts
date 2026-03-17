import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getExtractedContent, saveExtractedContent } from "@/lib/db";
import { fetchAsBot } from "@/lib/fetch-utils";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

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

  // Check cache first
  const cached = getExtractedContent(url);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetchAsBot(url);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed with status ${res.status}` },
        { status: 502 }
      );
    }

    const html = await res.text();
    const { document } = parseHTML(html);

    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      return NextResponse.json(
        { error: "Could not extract article content" },
        { status: 422 }
      );
    }

    const data = {
      title: article.title || null,
      content: article.content || "",
      textContent: article.textContent || null,
      excerpt: article.excerpt || null,
    };

    // Cache the extracted content
    saveExtractedContent(url, data);

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 502 }
    );
  }
}
