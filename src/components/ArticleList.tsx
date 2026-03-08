"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FeedlyEntry } from "@/lib/feedly";

const FONT_SIZE_CLASSES = [
  { title: "text-xs", meta: "text-[10px]" },
  { title: "text-sm", meta: "text-xs" },
  { title: "text-base", meta: "text-sm" },
  { title: "text-lg", meta: "text-sm" },
  { title: "text-xl", meta: "text-base" },
];

interface Props {
  entries: FeedlyEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onToggleStar: (entry: FeedlyEntry) => void;
  onToggleUnread: (entry: FeedlyEntry) => void;
  fontSizeLevel?: number;
  disableKeyboard?: boolean;
}

function timeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function ArticleList({
  entries,
  selectedIndex,
  onSelect,
  onToggleStar,
  onToggleUnread,
  fontSizeLevel = 1,
  disableKeyboard = false,
}: Props) {
  const fs = FONT_SIZE_CLASSES[fontSizeLevel] || FONT_SIZE_CLASSES[1];
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disableKeyboard) return;
      if (entries.length === 0) return;

      const entry = entries[selectedIndex];

      switch (e.key) {
        case "j":
          e.preventDefault();
          if (selectedIndex < 0) {
            onSelect(0);
          } else if (selectedIndex < entries.length - 1) {
            onSelect(selectedIndex + 1);
          }
          break;
        case "k":
          e.preventDefault();
          if (selectedIndex < 0) {
            onSelect(0);
          } else if (selectedIndex > 0) {
            onSelect(selectedIndex - 1);
          }
          break;
        case "b":
          e.preventDefault();
          if (entry?.alternate?.[0]?.href) {
            // Open in background tab: create a link with event to prevent focus steal
            const a = document.createElement("a");
            a.href = entry.alternate[0].href;
            a.target = "_blank";
            a.rel = "noopener";
            document.body.appendChild(a);
            // Dispatch click with Cmd/Ctrl held to hint background tab
            a.dispatchEvent(
              new MouseEvent("click", {
                ctrlKey: true,
                metaKey: true,
                bubbles: true,
              })
            );
            document.body.removeChild(a);
          }
          break;
        case "m":
          e.preventDefault();
          if (entry) {
            onToggleUnread(entry);
          }
          break;
        case "s":
          e.preventDefault();
          if (entry) {
            onToggleStar(entry);
          }
          break;
      }
    },
    [disableKeyboard, entries, selectedIndex, onSelect, onToggleStar, onToggleUnread]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        No articles
      </div>
    );
  }

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto">
      {entries.map((entry, index) => {
        const isSelected = index === selectedIndex;
        const isStarred = entry.tags?.some((t) =>
          t.id.includes("global.saved")
        );

        return (
          <div
            key={entry.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            onClick={() => onSelect(index)}
            className={`
              px-3 py-2 border-b border-gray-200 cursor-pointer transition-colors
              ${isSelected ? "bg-blue-50 border-l-4 border-l-blue-500" : "hover:bg-gray-50"}
              ${entry.unread ? "" : "opacity-75"}
            `}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {entry.unread && (
                    <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                  )}
                  <span className={`${fs.meta} text-gray-500 truncate`}>
                    {entry.origin?.title}
                  </span>
                  <span className={`${fs.meta} text-gray-400 flex-shrink-0`}>
                    {timeAgo(entry.published)}
                  </span>
                </div>
                <h3
                  className={`${fs.title} leading-snug ${entry.unread ? "font-semibold text-gray-900" : "text-gray-700"}`}
                >
                  {entry.title}
                </h3>
              </div>
              <span className={`flex-shrink-0 ${isStarred ? "text-yellow-500" : "text-gray-300"}`}>
                {isStarred ? "★" : "☆"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
