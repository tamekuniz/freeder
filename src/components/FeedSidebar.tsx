"use client";

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
  onLogout?: () => void;
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
  onLogout,
}: Props) {
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
    <div className="w-[20%] min-w-[180px] bg-orange-500 text-white flex-shrink-0 flex flex-col">
      <div className="p-4">
        <LogoWithText size={24} variant="white" className="mb-3" />
        <div className="flex flex-col gap-0.5">
          {onToggleUnreadOnly && (
            <button
              onClick={onToggleUnreadOnly}
              className={`w-full text-left px-2 py-1 text-xs rounded transition-colors hover:bg-orange-600 ${showUnreadOnly ? "text-white font-semibold" : "text-orange-100"}`}
            >
              {showUnreadOnly ? "● 未読のみ" : "○ すべて表示"}
            </button>
          )}
          {onToggleStarredOnly && (
            <button
              onClick={onToggleStarredOnly}
              className={`w-full text-left px-2 py-1 text-xs rounded transition-colors hover:bg-orange-600 ${
                showStarredOnly ? "text-yellow-200 font-semibold" : "text-orange-100"
              }`}
            >
              {showStarredOnly ? "★ スターのみ" : "☆ スターのみ"}
            </button>
          )}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto sidebar-scroll">
        {Array.from(categories.entries()).map(([label, subs]) => {
          const isOpen = !collapsedFolders[label];
          const catUnread = getCategoryUnread(subs);

          return (
            <div key={label} className="mb-1">
              <button
                onClick={() => onToggleFolder(label)}
                className="w-full text-left px-4 py-1.5 text-xs font-semibold text-orange-200 uppercase tracking-wider flex items-center justify-between hover:bg-orange-600 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px]">{isOpen ? "▼" : "▶"}</span>
                  {label}
                </span>
                {catUnread > 0 && (
                  <span className="text-[10px] text-white font-bold normal-case">
                    {catUnread}
                  </span>
                )}
              </button>
              {isOpen &&
                subs.map((sub) => {
                  const isSelected = selectedFeedId === sub.id;
                  const count = unreadCounts[sub.id] || 0;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => onSelectFeed(sub.id, label)}
                      className={`
                        w-full text-left pl-8 pr-4 py-1.5 text-sm flex items-center justify-between
                        transition-colors
                        ${isSelected ? "bg-orange-600 text-white font-semibold" : "hover:bg-orange-600/70 text-orange-50"}
                      `}
                    >
                      <span className="truncate">{sub.title}</span>
                      {count > 0 && (
                        <span className="text-xs bg-orange-700 text-white px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0">
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
      {username && (
        <div className="p-3 border-t border-orange-400">
          <div className="flex items-center justify-between">
            <span className="text-xs text-orange-100 truncate">{username}</span>
            <div className="flex items-center gap-2">
              {onSync && (
                <button
                  onClick={onSync}
                  disabled={syncing}
                  className="text-xs text-orange-200 hover:text-white transition-colors disabled:opacity-50"
                  title="Feedlyと同期 (Ctrl+R)"
                >
                  <span className={syncing ? "inline-block animate-spin" : ""}>
                    {syncing ? "↻" : "↻"}
                  </span>
                  {syncing ? " 同期中" : " 同期"}
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  className="text-xs text-orange-200 hover:text-white transition-colors"
                >
                  ログアウト
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
