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
  entry: FeedlyEntry;
  onClose: () => void;
  fontSizeLevel?: number;
}

export default function ArticlePreview({ entry, onClose, fontSizeLevel = 1 }: Props) {
  const content = entry.content?.content || entry.summary?.content || "";
  const url = entry.alternate?.[0]?.href;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-3xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex-1 min-w-0 mr-4">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {entry.title}
            </h2>
            <p className="text-sm text-gray-500">
              {entry.origin?.title}
              {entry.author && ` — ${entry.author}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                Open ↗
              </a>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
        <div
          className={`flex-1 overflow-y-auto px-6 py-4 prose ${PROSE_CLASSES[fontSizeLevel] || "prose-sm"} max-w-none`}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </div>
    </div>
  );
}
