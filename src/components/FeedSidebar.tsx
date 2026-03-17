"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { FeedlySubscription } from "@/lib/feedly";
import { LogoWithText } from "@/components/Logo";

interface Props {
  subscriptions: FeedlySubscription[];
  selectedFeedId: string | null;
  unreadCounts: Record<string, number>;
  onSelectFeed: (feedId: string, category: string) => void;
  showUnreadOnly?: boolean;
  onToggleUnreadOnly?: () => void;
  showStarredOnly?: boolean;
  onToggleStarredOnly?: () => void;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (label: string) => void;
  username?: string;
  syncing?: boolean;
  onSync?: () => void;
  onRefreshFeed?: (feedId: string) => void;
  onDeleteFeed?: (feedId: string) => void;
  onSelectFolder?: (feedIds: string[], folderLabel: string) => void;
  selectedFolderLabel?: string | null;
  onLogout?: () => void;
  onSettings?: () => void;
  width?: number;
}

export default function FeedSidebar({
  subscriptions,
  selectedFeedId,
  unreadCounts,
  onSelectFeed,
  showUnreadOnly = false,
  onToggleUnreadOnly,
  showStarredOnly = false,
  onToggleStarredOnly,
  collapsedFolders,
  onToggleFolder,
  username,
  syncing = false,
  onSync,
  onRefreshFeed,
  onDeleteFeed,
  onSelectFolder,
  selectedFolderLabel,
  onLogout,
  onSettings,
  width,
}: Props) {
  const router = useRouter();
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; feedIds: string[]; title: string } | null>(null);

  const handleClick = useCallback((e: React.MouseEvent, feedId: string, category: string) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+Click: toggle multi-select
      setMultiSelected(prev => {
        const next = new Set(prev);
        if (next.has(feedId)) next.delete(feedId);
        else next.add(feedId);
        return next;
      });
    } else {
      // Normal click: clear multi-select and select single feed
      setMultiSelected(new Set());
      onSelectFeed(feedId, category);
    }
  }, [onSelectFeed]);

  const handleFolderClick = useCallback((e: React.MouseEvent, subs: FeedlySubscription[], label: string) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+Click: toggle all feeds in folder
      setMultiSelected(prev => {
        const next = new Set(prev);
        const feedIds = subs.map(s => s.id);
        const allSelected = feedIds.every(id => next.has(id));
        if (allSelected) {
          for (const id of feedIds) next.delete(id);
        } else {
          for (const id of feedIds) next.add(id);
        }
        return next;
      });
    } else {
      // Normal click: clear multi-select and select folder
      setMultiSelected(new Set());
      if (onSelectFolder) onSelectFolder(subs.map(s => s.id), label);
    }
  }, [onSelectFolder]);

  const handleContextMenu = useCallback((e: React.MouseEvent, feedId: string, feedTitle: string) => {
    e.preventDefault();
    if (multiSelected.size > 0 && multiSelected.has(feedId)) {
      // Right-click on a multi-selected item: operate on all selected
      setContextMenu({ x: e.clientX, y: e.clientY, feedIds: Array.from(multiSelected), title: `${multiSelected.size}件のフィード` });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, feedIds: [feedId], title: feedTitle });
    }
  }, [multiSelected]);

  const handleFolderContextMenu = useCallback((e: React.MouseEvent, label: string, subs: FeedlySubscription[]) => {
    e.preventDefault();
    const folderFeedIds = subs.map(s => s.id);
    if (multiSelected.size > 0) {
      // If any multi-selected items exist, add folder's feeds too
      const combined = new Set([...multiSelected, ...folderFeedIds]);
      setContextMenu({ x: e.clientX, y: e.clientY, feedIds: Array.from(combined), title: `${combined.size}件のフィード` });
    } else {
      setContextMenu({ x: e.clientX, y: e.clientY, feedIds: folderFeedIds, title: `フォルダ「${label}」(${subs.length}件)` });
    }
  }, [multiSelected]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  // Filter subscriptions if unread-only mode
  const filteredSubs = showUnreadOnly
    ? subscriptions.filter((sub) => (unreadCounts[sub.id] || 0) > 0)
    : subscriptions;

  const catMap = new Map<string, FeedlySubscription[]>();

  for (const sub of filteredSubs) {
    if (sub.categories.length === 0) {
      const key = "Uncategorized";
      if (!catMap.has(key)) catMap.set(key, []);
      catMap.get(key)!.push(sub);
    } else {
      for (const cat of sub.categories) {
        if (!catMap.has(cat.label)) catMap.set(cat.label, []);
        catMap.get(cat.label)!.push(sub);
      }
    }
  }

  // Sort: _ prefixed first, then alphabetical, Uncategorized last
  const sortedKeys = Array.from(catMap.keys()).sort((a, b) => {
    if (a === "Uncategorized") return 1;
    if (b === "Uncategorized") return -1;
    const aUnderscore = a.startsWith("_");
    const bUnderscore = b.startsWith("_");
    if (aUnderscore && !bUnderscore) return -1;
    if (!aUnderscore && bUnderscore) return 1;
    return a.localeCompare(b);
  });

  const categories = new Map<string, FeedlySubscription[]>();
  for (const key of sortedKeys) {
    const subs = catMap.get(key)!;
    subs.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    categories.set(key, subs);
  }

  function getCategoryUnread(subs: FeedlySubscription[]): number {
    return subs.reduce((sum, sub) => sum + (unreadCounts[sub.id] || 0), 0);
  }

  return (
    <div className="bg-orange-500 text-white flex-shrink-0 flex flex-col" style={width ? { width: `${width}px`, minWidth: 140 } : { width: "20%", minWidth: 180 }}>
      <div className="p-4">
        <div className="flex items-center mb-3">
          <LogoWithText size={24} variant="white" />
        </div>
        <div className="flex items-center gap-2">
          {onToggleUnreadOnly && (
            <div className="flex bg-orange-600 rounded-full p-0.5 text-[11px]">
              <button
                onClick={() => {
                  if (showUnreadOnly) onToggleUnreadOnly();
                  if (showStarredOnly && onToggleStarredOnly) onToggleStarredOnly();
                }}
                className={`px-2.5 py-0.5 rounded-full transition-colors ${!showUnreadOnly && !showStarredOnly ? "bg-white text-orange-500 font-semibold" : "text-white/70 hover:text-white"}`}
              >
                ALL
              </button>
              <button
                onClick={() => {
                  if (!showUnreadOnly) onToggleUnreadOnly();
                  if (showStarredOnly && onToggleStarredOnly) onToggleStarredOnly();
                }}
                className={`px-2.5 py-0.5 rounded-full transition-colors ${showUnreadOnly && !showStarredOnly ? "bg-white text-orange-500 font-semibold" : "text-white/70 hover:text-white"}`}
              >
                UNREAD
              </button>
              {onToggleStarredOnly && (
                <button
                  onClick={() => {
                    if (!showStarredOnly) onToggleStarredOnly();
                    if (showUnreadOnly) onToggleUnreadOnly();
                  }}
                  className={`px-2.5 py-0.5 rounded-full transition-colors ${showStarredOnly ? "bg-white text-orange-500 font-semibold" : "text-white/70 hover:text-white"}`}
                >
                  ★
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto feed-scroll">
        {Array.from(categories.entries()).map(([label, subs]) => {
          const isOpen = !collapsedFolders[label];
          const catUnread = getCategoryUnread(subs);
          const isFolderSelected = selectedFolderLabel === label && !selectedFeedId;

          return (
            <div key={label} className="mb-1">
              <div
                onContextMenu={(e) => handleFolderContextMenu(e, label, subs)}
                className={`w-full flex items-center justify-between px-4 py-1.5 text-xs font-semibold uppercase tracking-wider border-b-[6px] transition-colors ${
                isFolderSelected ? "bg-white text-orange-500 border-white" : "text-white border-transparent hover:border-white"
              }`}>
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFolder(label); }}
                    className="text-[10px] p-0.5 hover:text-white transition-colors"
                    title={isOpen ? "フォルダを閉じる" : "フォルダを開く"}
                  >
                    {isOpen ? "▼" : "▶"}
                  </button>
                  <button
                    onClick={(e) => {
                      handleFolderClick(e, subs, label);
                      if (!isOpen && !(e.metaKey || e.ctrlKey)) {
                        onToggleFolder(label);
                      }
                    }}
                    className="hover:text-white transition-colors"
                  >
                    {label}
                  </button>
                </span>
                {catUnread > 0 && (
                  <span className="text-[10px] bg-white text-orange-500 font-bold normal-case px-1.5 py-0.5 rounded-full">
                    {catUnread}
                  </span>
                )}
              </div>
              {isOpen &&
                subs.map((sub) => {
                  const isSelected = selectedFeedId === sub.id;
                  const count = unreadCounts[sub.id] || 0;
                  return (
                    <button
                      key={sub.id}
                      onClick={(e) => handleClick(e, sub.id, label)}
                      onContextMenu={(e) => handleContextMenu(e, sub.id, sub.title || sub.id)}
                      className={`
                        w-full text-left pl-8 pr-4 py-1.5 text-sm flex items-center justify-between
                        transition-colors
                        ${isSelected ? "bg-white text-orange-500 font-semibold border-b-4 border-white" : multiSelected.has(sub.id) ? "bg-white/20 text-white border-b-4 border-white" : "border-b-4 border-transparent hover:border-white text-white"}
                      `}
                    >
                      <span className="truncate min-w-0">{sub.title}</span>
                      {count > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                          isSelected ? "bg-orange-500 text-white" : "bg-white text-orange-500"
                        }`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </nav>
      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={(e) => { e.preventDefault(); closeContextMenu(); }} />
          <div
            className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="px-3 py-1.5 text-xs text-gray-400 truncate max-w-[200px]">{contextMenu.title}</div>
            <hr className="border-gray-100" />
            {onRefreshFeed && (
              <button
                onClick={() => {
                  for (const id of contextMenu.feedIds) onRefreshFeed(id);
                  closeContextMenu();
                  setMultiSelected(new Set());
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-orange-50 transition-colors flex items-center gap-2"
              >
                <span>↻</span> {contextMenu.feedIds.length > 1 ? `${contextMenu.feedIds.length}件を更新` : "更新"}
              </button>
            )}
            {onDeleteFeed && (
              <button
                onClick={() => {
                  const count = contextMenu.feedIds.length;
                  const msg = count > 1
                    ? `${count}件のフィードを削除しますか？`
                    : `「${contextMenu.title}」を削除しますか？`;
                  if (window.confirm(msg)) {
                    for (const id of contextMenu.feedIds) onDeleteFeed(id);
                  }
                  closeContextMenu();
                  setMultiSelected(new Set());
                }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <span>✕</span> {contextMenu.feedIds.length > 1 ? `${contextMenu.feedIds.length}件を削除` : "削除"}
              </button>
            )}
          </div>
        </>
      )}
      {username && (
        <div className="p-3 border-t border-white/30">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push("/settings")}
              className="w-7 h-7 rounded-full bg-white text-orange-500 font-bold text-sm flex items-center justify-center flex-shrink-0 hover:ring-2 hover:ring-white/50 transition-all cursor-pointer"
              title="ユーザー設定"
            >
              {username.charAt(0).toUpperCase()}
            </button>
            <div className="flex items-center gap-1">
              {onSync && (
                <button
                  onClick={onSync}
                  disabled={syncing}
                  title="RSSフィードを更新 (Ctrl+R)"
                  className={`p-1 text-white hover:text-white transition-colors rounded hover:bg-orange-600 ${syncing ? "animate-spin" : ""}`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                  </svg>
                </button>
              )}
              {onSettings && (
                <button
                  onClick={onSettings}
                  className="p-1 text-white hover:text-white transition-colors rounded hover:bg-orange-600"
                  title="設定"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="p-1 text-white hover:text-white transition-colors rounded hover:bg-orange-600"
                  title="ログアウト"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
