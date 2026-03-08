"use client";

import type { FeedlySubscription } from "@/lib/feedly";

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
    <div className="w-[20%] min-w-[180px] bg-gray-900 text-gray-300 overflow-y-auto flex-shrink-0">
      <div className="p-4">
        <h1 className="text-lg font-bold text-white mb-3">freeder</h1>
        <div className="flex flex-col gap-0.5">
          {onToggleUnreadOnly && (
            <button
              onClick={onToggleUnreadOnly}
              className="w-full text-left px-2 py-1 text-xs rounded transition-colors hover:bg-gray-800 text-gray-400"
            >
              {showUnreadOnly ? "● 未読のみ" : "○ すべて表示"}
            </button>
          )}
          {onToggleStarredOnly && (
            <button
              onClick={onToggleStarredOnly}
              className={`w-full text-left px-2 py-1 text-xs rounded transition-colors hover:bg-gray-800 ${
                showStarredOnly ? "text-yellow-400" : "text-gray-400"
              }`}
            >
              {showStarredOnly ? "★ スターのみ" : "☆ スターのみ"}
            </button>
          )}
        </div>
      </div>
      <nav>
        {Array.from(categories.entries()).map(([label, subs]) => {
          const isOpen = !collapsedFolders[label];
          const catUnread = getCategoryUnread(subs);

          return (
            <div key={label} className="mb-1">
              <button
                onClick={() => onToggleFolder(label)}
                className="w-full text-left px-4 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between hover:bg-gray-800 transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px]">{isOpen ? "▼" : "▶"}</span>
                  {label}
                </span>
                {catUnread > 0 && (
                  <span className="text-[10px] text-orange-500 font-normal normal-case">
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
                        ${isSelected ? "bg-gray-700 text-white" : "hover:bg-gray-800"}
                      `}
                    >
                      <span className="truncate">{sub.title}</span>
                      {count > 0 && (
                        <span className="text-xs bg-gray-700 text-orange-500 px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0">
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
    </div>
  );
}
