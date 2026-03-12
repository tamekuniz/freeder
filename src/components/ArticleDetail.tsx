"use client";

import type { FeedlyEntry } from "@/lib/feedly";

const PROSE_CLASSES = [
  "prose-xs",
  "prose-sm",
  "prose-base",
  "prose-lg",
  "prose-xl",
];

interface Props {
  entry: FeedlyEntry | null;
  fontSizeLevel?: number;
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ArticleDetail({ entry, fontSizeLevel = 1 }: Props) {
  if (!entry) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        記事を選択してください
      </div>
    );
  }

  const content = entry.content?.content || entry.summary?.content || "";
  const url = entry.alternate?.[0]?.href;
  const proseClass = PROSE_CLASSES[fontSizeLevel] || "prose-sm";

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-6 py-4 border-b bg-white flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 leading-snug mb-1">
          {entry.title}
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{entry.origin?.title}</span>
          {entry.author && <span>— {entry.author}</span>}
          <span>{formatDate(entry.published)}</span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-500 hover:underline ml-auto"
            >
              Open ↗
            </a>
          )}
        </div>
      </div>
      <div
        className={`flex-1 overflow-y-auto px-6 py-4 prose ${proseClass} max-w-none [&_img]:max-w-full [&_img]:h-auto`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
