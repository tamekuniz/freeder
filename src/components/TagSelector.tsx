"use client";
import { useState, useEffect, useRef } from "react";
import TagBadge from "./TagBadge";

interface Tag {
  id: number;
  name: string;
  color: string;
}

interface TagSelectorProps {
  entryId: string;
  currentTags: Tag[];
  onClose: () => void;
  onTagsChanged: () => void;
}

export default function TagSelector({ entryId, currentTags, onClose, onTagsChanged }: TagSelectorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // マウント時にfocus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // 全タグ取得
  useEffect(() => {
    fetch("/api/rss/tags")
      .then(r => r.json())
      .then(tags => { setAllTags(tags); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Escで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // タグ追加（既存タグをエントリに付与）
  const addTag = async (tagId: number) => {
    await fetch("/api/rss/tags/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, tagId }),
    });
    onTagsChanged();
  };

  // タグ削除（エントリからタグを外す）
  const removeTag = async (tagId: number) => {
    await fetch("/api/rss/tags/entries", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId, tagId }),
    });
    onTagsChanged();
  };

  // 新規タグ作成
  const createTag = async () => {
    if (!newTagName.trim()) return;
    const res = await fetch("/api/rss/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTagName.trim() }),
    });
    const tag = await res.json();
    if (tag.id) {
      setAllTags(prev => [...prev, tag]);
      await addTag(tag.id);
      setNewTagName("");
    }
  };

  const currentTagIds = new Set(currentTags.map(t => t.id));
  const availableTags = allTags.filter(t => !currentTagIds.has(t.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl p-4 w-80 max-h-96 overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-2 text-gray-700">タグ</h3>

        {/* 現在のタグ */}
        {currentTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {currentTags.map(tag => (
              <TagBadge key={tag.id} name={tag.name} color={tag.color} onRemove={() => removeTag(tag.id)} />
            ))}
          </div>
        )}

        {/* 利用可能なタグ */}
        {availableTags.length > 0 && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1">タグを追加</p>
            <div className="flex flex-wrap gap-1">
              {availableTags.map(tag => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} onClick={() => addTag(tag.id)} />
              ))}
            </div>
          </div>
        )}

        {/* 新規タグ作成 */}
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); createTag(); } }}
            placeholder="新しいタグ..."
            className="flex-1 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-orange-400"
          />
          <button
            onClick={createTag}
            disabled={!newTagName.trim()}
            className="px-2 py-1 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
          >
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
