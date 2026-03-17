"use client";
import { useState, useEffect } from "react";
import TagBadge from "./TagBadge";

interface LookalikeResult {
  entry: { id: string; title?: string; origin?: { title: string }; published?: number };
  commonTags: number;
}

interface LookalikeSectionProps {
  entryId: string | null;
  onSelectEntry: (entry: any) => void;
}

export default function LookalikeSection({ entryId, onSelectEntry }: LookalikeSectionProps) {
  const [results, setResults] = useState<LookalikeResult[]>([]);
  const [aiTags, setAiTags] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entryId) { setResults([]); setAiTags([]); return; }

    setLoading(true);
    fetch(`/api/rss/lookalike?entryId=${encodeURIComponent(entryId)}&minCommon=2&limit=5`)
      .then(r => r.json())
      .then(data => {
        setResults(data.results || []);
        setAiTags(data.aiTags || []);
        setLoading(false);
      })
      .catch(() => { setResults([]); setAiTags([]); setLoading(false); });
  }, [entryId]);

  if (!entryId) return null;
  // AIタグもLookalike結果もない場合は表示しない
  if (!loading && aiTags.length === 0 && results.length === 0) return null;

  return (
    <div className="border-t border-gray-200 mt-4 pt-3">
      {/* AIタグ表示 */}
      {aiTags.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1">AIタグ</p>
          <div className="flex flex-wrap gap-1">
            {aiTags.map(tag => (
              <TagBadge key={tag.id} name={tag.name} isAi />
            ))}
          </div>
        </div>
      )}

      {/* Lookalike結果 */}
      {loading && <p className="text-xs text-gray-400">似た記事を検索中...</p>}
      {!loading && results.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">似た記事</p>
          <div className="space-y-1">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => onSelectEntry(r.entry)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-orange-50 transition-colors"
              >
                <div className="text-sm text-gray-800 line-clamp-1">{r.entry.title || "(無題)"}</div>
                <div className="text-xs text-gray-400 flex gap-2">
                  <span>{r.entry.origin?.title}</span>
                  <span>共通タグ {r.commonTags}個</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
