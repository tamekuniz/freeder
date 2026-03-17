import { getPreference } from "../db";

// --- HTML strip utility ---

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// --- AI config ---

export function getAiConfig(
  userId: number
): { url: string; model: string } | null {
  const provider = getPreference("ai_provider", userId);
  if (provider !== "ollama") return null;

  const url = getPreference("ollama_url", userId);
  const model = getPreference("ollama_model", userId);
  if (!url || !model) return null;

  return { url, model };
}

// --- Tag generation ---

const MAX_TEXT_LENGTH = 2000;

const SYSTEM_PROMPT =
  "あなたは記事分類の専門家です。記事の内容から関連するタグを生成してください。";

function buildUserPrompt(text: string): string {
  return `以下の記事の内容から関連するタグを生成してください。

条件:
- タグは英語小文字、ハイフン区切り（例: machine-learning, web-security, startup）
- 3〜8個程度
- 具体的すぎず抽象的すぎないレベル
- JSON配列形式で返してください: ["tag1", "tag2", "tag3"]

記事:
${text}`;
}

function extractJsonArray(raw: string): string[] {
  // Try direct parse first
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
    // Handle {"tags": [...]} or similar wrapper objects
    if (parsed && typeof parsed === "object") {
      const values = Object.values(parsed);
      for (const v of values) {
        if (Array.isArray(v)) {
          return (v as unknown[]).filter(
            (t): t is string => typeof t === "string"
          );
        }
      }
    }
  } catch {
    // Fall through to bracket extraction
  }

  // Extract content between [ and ]
  const match = raw.match(/\[[\s\S]*?\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // Give up
    }
  }

  return [];
}

export async function generateAiTags(
  text: string,
  ollamaUrl: string,
  model: string
): Promise<string[]> {
  try {
    const cleaned = stripHtml(text);
    const truncated =
      cleaned.length > MAX_TEXT_LENGTH
        ? cleaned.slice(0, MAX_TEXT_LENGTH)
        : cleaned;

    if (!truncated.trim()) return [];

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: buildUserPrompt(truncated),
        system: SYSTEM_PROMPT,
        stream: false,
        format: "json",
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const response: string = data.response ?? "";

    return extractJsonArray(response);
  } catch {
    return [];
  }
}
