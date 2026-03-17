import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/api-auth";
import { getEntriesWithoutAiTags, setEntryAiTags } from "@/lib/db";
import { generateAiTags, getAiConfig, stripHtml } from "@/lib/ai/tagger";

export async function POST(request: NextRequest) {
  const auth = await requireLogin();
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const config = getAiConfig(userId);
  if (!config) {
    return NextResponse.json(
      { error: "AI provider not configured. Please set up Ollama in settings." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const limit = body.limit || 20;

  // 未タグ付け記事を取得
  const entries = getEntriesWithoutAiTags(userId, limit);

  let tagged = 0;
  let errors = 0;

  // 2件ずつ並列処理
  for (let i = 0; i < entries.length; i += 2) {
    const chunk = entries.slice(i, i + 2);
    const results = await Promise.allSettled(
      chunk.map(async (entry) => {
        const parsed = JSON.parse(entry.data);
        const title = parsed.title || "";
        const content =
          parsed.summary?.content || parsed.content?.content || "";
        const text = `${title}\n\n${stripHtml(content)}`;

        if (text.trim().length < 20) return false;

        const tags = await generateAiTags(text, config.url, config.model);
        if (tags.length > 0) {
          setEntryAiTags(userId, entry.id, tags);
          return true;
        }
        return false;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) tagged++;
      else if (r.status === "rejected") errors++;
    }
  }

  // 残りの未タグ記事数を取得（正確な数は重いのでフラグだけ）
  const remainingEntries = getEntriesWithoutAiTags(userId, 1);
  const remaining = remainingEntries.length > 0 ? "more" : 0;

  return NextResponse.json({ tagged, remaining, errors });
}
