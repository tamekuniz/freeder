"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
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
  extractedContent?: string | null;
  extracting?: boolean;
  extractError?: string | null;
  onExtractFullText?: () => void;
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

export interface ArticleDetailHandle {
  focus: () => void;
}

const ArticleDetail = forwardRef<ArticleDetailHandle, Props>(function ArticleDetail({
  entry,
  fontSizeLevel = 1,
  extractedContent,
  extracting,
  extractError,
  onExtractFullText,
}, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      scrollRef.current?.focus();
    },
  }));

  // Scroll to top when entry changes
  useEffect(() => {
    if (entry && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entry?.id]);

  if (!entry) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        記事を選択してください
      </div>
    );
  }

  const originalContent = entry.content?.content || entry.summary?.content || "";
  const content = extractedContent || originalContent;
  const url = entry.alternate?.[0]?.href;
  const proseClass = PROSE_CLASSES[fontSizeLevel] || "prose-sm";
  const hasSummaryOnly = !entry.content?.content;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-6 py-4 bg-white flex-shrink-0">
        <h2 className="text-lg font-semibold text-gray-900 leading-snug mb-1">
          {entry.title}
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{entry.origin?.title}</span>
          {entry.author && <span>— {entry.author}</span>}
          <span>{formatDate(entry.published)}</span>
          <div className="ml-auto flex items-center gap-2">
            {onExtractFullText && url && !extracting && (
              <button
                onClick={onExtractFullText}
                className="text-orange-500 hover:text-orange-600 hover:underline"
                title="全文取得"
              >
                {extractedContent ? "再取得 ↻" : "全文取得 ↓"}
              </button>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-500 hover:underline"
              >
                Open ↗
              </a>
            )}
          </div>
        </div>
      </div>
      <div
        ref={scrollRef}
        tabIndex={-1}
        className={`flex-1 overflow-y-auto orange-scroll px-6 py-4 prose ${proseClass} max-w-none [&_img]:max-w-full [&_img]:h-auto outline-none`}
      >
        {extracting && (
          <div className="text-gray-400 text-sm mb-4 flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
            全文を取得中...
          </div>
        )}
        {extractError && !extractedContent && (
          <div className="text-gray-400 text-sm mb-4">
            全文取得できませんでした: {extractError}
          </div>
        )}
        {hasSummaryOnly && extractedContent && (
          <div className="text-xs text-orange-500 mb-3">
            ● 全文表示中
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
});

export default ArticleDetail;
