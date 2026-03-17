"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedlyEntry } from "@/lib/feedly";

interface SearchResult {
  entry: FeedlyEntry;
  snippet: string;
  feedTitle: string;
}

interface Props {
  onClose: () => void;
  onSelectEntry: (entry: FeedlyEntry) => void;
  streamIds?: string[];
  scopeLabel?: string;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function SearchModal({ onClose, onSelectEntry, streamIds, scopeLabel }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Auto-focus the input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query, limit: "30" });
        if (streamIds && streamIds.length > 0) params.set("streamIds", streamIds.join(","));
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        setResults(data.results || []);
        setSelectedIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Scroll selected result into view
  useEffect(() => {
    const container = resultsRef.current;
    if (!container) return;
    const items = container.children;
    if (items[selectedIdx]) {
      items[selectedIdx].scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  // Keyboard navigation inside the modal
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && results[selectedIdx]) {
        e.preventDefault();
        onSelectEntry(results[selectedIdx].entry);
        onClose();
        return;
      }
    },
    [results, selectedIdx, onClose, onSelectEntry]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,.65)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[700px] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="px-4 py-3 border-b flex items-center gap-3">
          <span className="text-gray-400 text-lg">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={scopeLabel ? `${scopeLabel} 内を検索...` : "全記事を検索..."}
            className="flex-1 text-lg outline-none bg-transparent text-gray-900"
          />
          {loading && <span className="text-sm text-gray-400">...</span>}
          <kbd className="text-xs text-gray-400 border px-1.5 py-0.5 rounded">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto" ref={resultsRef}>
          {results.map((r, i) => (
            <div
              key={r.entry.id}
              className={`px-4 py-3 border-b cursor-pointer ${
                i === selectedIdx ? "bg-orange-50" : "hover:bg-gray-50"
              }`}
              onClick={() => {
                onSelectEntry(r.entry);
                onClose();
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div className="text-sm font-semibold text-gray-900 truncate">
                {r.entry.title}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {r.feedTitle} — {formatDate(r.entry.published)}
              </div>
              <div
                className="text-xs text-gray-600 mt-1 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:rounded-sm"
                dangerouslySetInnerHTML={{ __html: r.snippet }}
              />
            </div>
          ))}
          {query && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400">
              見つかりませんでした
            </div>
          )}
          {!query && (
            <div className="px-4 py-8 text-center text-gray-400">
              キーワードを入力してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
