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
  translatedContent?: string | null;
  translating?: boolean;
  searchQuery?: string;
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
  translatedContent,
  translating,
  searchQuery,
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

  // Article text search: scroll to first match using browser find
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function clearMarks(container: HTMLElement) {
      container.querySelectorAll("mark[data-search]").forEach(m => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent || ""), m);
          parent.normalize();
        }
      });
    }

    if (!contentRef.current || !searchQuery?.trim()) {
      if (contentRef.current) clearMarks(contentRef.current);
      return;
    }

    const query = searchQuery.trim().toLowerCase();
    const container = contentRef.current;
    clearMarks(container);

    // Walk text nodes and wrap matches with <mark>
    const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const matches: { node: Text; index: number }[] = [];
    let textNode: Node | null;
    while ((textNode = treeWalker.nextNode())) {
      const text = textNode.textContent?.toLowerCase() || "";
      let idx = text.indexOf(query);
      while (idx >= 0) {
        matches.push({ node: textNode as Text, index: idx });
        idx = text.indexOf(query, idx + 1);
      }
    }

    // Apply marks in reverse order to preserve indices
    let firstMark: HTMLElement | null = null;
    for (let i = matches.length - 1; i >= 0; i--) {
      const { node: tNode, index } = matches[i];
      const mark = document.createElement("mark");
      mark.setAttribute("data-search", "");
      mark.style.backgroundColor = "#fbbf24";
      mark.style.color = "#000";
      mark.style.borderRadius = "2px";
      const range = document.createRange();
      range.setStart(tNode, index);
      range.setEnd(tNode, index + query.length);
      range.surroundContents(mark);
      firstMark = mark;
    }

    if (firstMark) {
      firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [searchQuery, extractedContent, entry?.id]);

  if (!entry) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        記事を選択してください
      </div>
    );
  }

  const originalContent = entry.content?.content || entry.summary?.content || "";
  const content = extractedContent || originalContent;
  const proseClass = PROSE_CLASSES[fontSizeLevel] || "prose-sm";
  const hasSummaryOnly = !entry.content?.content;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <div className="px-6 py-3 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{entry.origin?.title}</span>
          {entry.author && <span>— {entry.author}</span>}
          <span>{formatDate(entry.published)}</span>
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
        {translating && (
          <div className="text-gray-400 text-sm mb-4 flex items-center gap-2">
            <span className="inline-block w-4 h-4 border-2 border-orange-300 border-t-orange-500 rounded-full animate-spin" />
            翻訳中...
          </div>
        )}
        {translatedContent && (
          <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="text-xs text-orange-500 font-medium mb-2">AI 翻訳</div>
            <div className="text-gray-800 whitespace-pre-wrap">{translatedContent}</div>
          </div>
        )}
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
});

export default ArticleDetail;
