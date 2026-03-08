"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeedlyEntry, FeedlySubscription } from "@/lib/feedly";
import FeedSidebar from "@/components/FeedSidebar";
import ArticleList from "@/components/ArticleList";
import ArticleDetail from "@/components/ArticleDetail";
import SitePreview from "@/components/SitePreview";
import SearchModal from "@/components/SearchModal";
import KeyboardHint from "@/components/KeyboardHint";

export default function Home() {
  const [subscriptions, setSubscriptions] = useState<FeedlySubscription[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<FeedlyEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [feedIndex, setFeedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [fontSizeLevel, setFontSizeLevel] = useState(1); // 0-4: xs, sm, base, lg, xl
  const [sitePreviewEntry, setSitePreviewEntry] = useState<FeedlyEntry | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchScope, setSearchScope] = useState<{ streamIds: string[]; label: string } | null>(null);
  const [detailOverride, setDetailOverride] = useState<FeedlyEntry | null>(null);

  // Compute feed order matching sidebar visual display (with duplicates for multi-category feeds)
  type SortedFeedItem = { sub: FeedlySubscription; category: string };
  const sortedFeeds = useMemo((): SortedFeedItem[] => {
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

    // Sort categories: _ prefixed first, then alphabetical, Uncategorized last
    const sortedKeys = Array.from(catMap.keys()).sort((a, b) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      const aUnderscore = a.startsWith("_");
      const bUnderscore = b.startsWith("_");
      if (aUnderscore && !bUnderscore) return -1;
      if (!aUnderscore && bUnderscore) return 1;
      return a.localeCompare(b);
    });

    // Flatten into ordered list matching sidebar visual order (duplicates preserved)
    const result: SortedFeedItem[] = [];
    for (const key of sortedKeys) {
      const subs = [...catMap.get(key)!];
      subs.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      for (const sub of subs) {
        result.push({ sub, category: key });
      }
    }
    return result;
  }, [subscriptions, showUnreadOnly, unreadCounts]);

  // Also compute sorted category order for g/; navigation
  const sortedCategories = useMemo(() => {
    const catSet = new Set<string>();
    for (const item of sortedFeeds) {
      catSet.add(item.category);
    }
    // Already in correct order from sortedFeeds, but use Set to deduplicate
    const ordered: string[] = [];
    for (const item of sortedFeeds) {
      if (!ordered.includes(item.category)) ordered.push(item.category);
    }
    return ordered;
  }, [sortedFeeds]);

  // Load subscriptions, unread counts, and preferences
  useEffect(() => {
    async function load() {
      try {
        const [subs, counts, prefs] = await Promise.all([
          fetch("/api/feedly/subscriptions").then((r) => r.json()),
          fetch("/api/feedly/markers").then((r) => r.json()),
          fetch("/api/preferences").then((r) => r.json()),
        ]);

        if (prefs["unread-only"] === "true") {
          setShowUnreadOnly(true);
        }
        if (prefs["font-size-level"]) {
          const level = parseInt(prefs["font-size-level"], 10);
          if (level >= 0 && level <= 4) setFontSizeLevel(level);
        }
        if (prefs["collapsed-folders"]) {
          try {
            setCollapsedFolders(JSON.parse(prefs["collapsed-folders"]));
          } catch { /* ignore parse errors */ }
        }

        if (subs.error) throw new Error(subs.error);

        setSubscriptions(subs);

        const countMap: Record<string, number> = {};
        if (counts.unreadcounts) {
          for (const c of counts.unreadcounts) {
            countMap[c.id] = c.count;
          }
        }
        setUnreadCounts(countMap);

        // Don't auto-select a feed on startup
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Load entries when feed changes (SQLite fallback handled server-side)
  useEffect(() => {
    if (!selectedFeedId) return;

    async function loadEntries() {
      try {
        const res = await fetch(
          `/api/feedly/streams?streamId=${encodeURIComponent(selectedFeedId!)}&count=50&unreadOnly=true`
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setEntries(data.items || []);
        setSelectedIndex(-1);
      } catch {
        // Server-side SQLite fallback handles this
      }
    }
    loadEntries();
  }, [selectedFeedId]);

  // Mark as read when selecting an article (only on index change, not entries change)
  useEffect(() => {
    const entry = entries[selectedIndex];
    if (entry?.unread) {
      fetch("/api/feedly/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markAsRead", entryIds: [entry.id] }),
      });
      setEntries((prev) =>
        prev.map((e, i) => (i === selectedIndex ? { ...e, unread: false } : e))
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  // Update preview when selectedIndex changes (j/k navigation while preview is open)
  useEffect(() => {
    const entry = entries[selectedIndex];
    if (!entry) return;
    if (sitePreviewEntry) setSitePreviewEntry(entry);
  }, [selectedIndex, entries]);

  const handleToggleUnread = useCallback(
    (entry: FeedlyEntry) => {
      const action = entry.unread ? "markAsRead" : "keepUnread";
      fetch("/api/feedly/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entryIds: [entry.id] }),
      });
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, unread: !e.unread } : e
        )
      );
    },
    []
  );

  const handleToggleStar = useCallback(
    (entry: FeedlyEntry) => {
      const isStarred = entry.tags?.some((t) => t.id.includes("global.saved"));
      if (isStarred) {
        fetch("/api/feedly/tags", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId: entry.id }),
        });
      } else {
        fetch("/api/feedly/tags", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entryId: entry.id }),
        });
      }
      setEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entry.id) return e;
          if (isStarred) {
            return {
              ...e,
              tags: e.tags?.filter((t) => !t.id.includes("global.saved")),
            };
          } else {
            return {
              ...e,
              tags: [
                ...(e.tags || []),
                { id: "user/global.saved", label: "Saved" },
              ],
            };
          }
        })
      );
    },
    []
  );

  // Refresh current feed (R key)
  const refreshFeed = useCallback(async () => {
    if (!selectedFeedId) return;
    try {
      const [streamRes, countsRes] = await Promise.all([
        fetch(`/api/feedly/streams?streamId=${encodeURIComponent(selectedFeedId)}&count=50&unreadOnly=true`),
        fetch("/api/feedly/markers"),
      ]);
      const data = await streamRes.json();
      if (data.error) throw new Error(data.error);
      setEntries(data.items || []);
      setSelectedIndex(-1);

      const counts = await countsRes.json();
      if (counts.unreadcounts) {
        const countMap: Record<string, number> = {};
        for (const c of counts.unreadcounts) {
          countMap[c.id] = c.count;
        }
        setUnreadCounts(countMap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh");
    }
  }, [selectedFeedId]);

  // Keyboard navigation for feeds, folders, and refresh
  useEffect(() => {
    function handleFeedNav(e: KeyboardEvent) {
      // Suppress all shortcuts while search modal is open
      if (showSearch) return;

      // /: open global search
      if (e.key === "/") {
        e.preventDefault();
        setSearchScope(null);
        setShowSearch(true);
        return;
      }

      // f: search within current folder
      if (e.key === "f") {
        e.preventDefault();
        const currentItem = sortedFeeds[feedIndex];
        if (currentItem) {
          const folderLabel = currentItem.category;
          // Gather all feed IDs in this folder
          const ids = sortedFeeds
            .filter((item) => item.category === folderLabel)
            .map((item) => item.sub.id);
          setSearchScope({ streamIds: ids, label: folderLabel });
          setShowSearch(true);
        }
        return;
      }

      // +/-: font size (works even with no subscriptions)
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setFontSizeLevel((prev) => {
          const next = Math.min(prev + 1, 4);
          fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "font-size-level", value: String(next) }),
          });
          return next;
        });
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        setFontSizeLevel((prev) => {
          const next = Math.max(prev - 1, 0);
          fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "font-size-level", value: String(next) }),
          });
          return next;
        });
        return;
      }

      // v: site preview modal
      if (e.key === "v" && entries.length > 0) {
        e.preventDefault();
        const entry = entries[selectedIndex];
        if (entry) {
          setSitePreviewEntry((prev) => (prev?.id === entry.id ? null : entry));
        }
        return;
      }

      if (sortedFeeds.length === 0) return;

      // Ctrl+R: refresh
      if (e.key === "r" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        refreshFeed();
        return;
      }

      // h: next feed
      if (e.key === "h" && !e.shiftKey) {
        e.preventDefault();
        const next = Math.min(feedIndex + 1, sortedFeeds.length - 1);
        setFeedIndex(next);
        setSelectedFeedId(sortedFeeds[next].sub.id);
        return;
      }

      // H: next feed with unread
      if (e.key === "H") {
        e.preventDefault();
        for (let i = feedIndex + 1; i < sortedFeeds.length; i++) {
          if ((unreadCounts[sortedFeeds[i].sub.id] || 0) > 0) {
            setFeedIndex(i);
            setSelectedFeedId(sortedFeeds[i].sub.id);
            return;
          }
        }
        return;
      }

      // l: prev feed
      if (e.key === "l" && !e.shiftKey) {
        e.preventDefault();
        const prev = Math.max(feedIndex - 1, 0);
        setFeedIndex(prev);
        setSelectedFeedId(sortedFeeds[prev].sub.id);
        return;
      }

      // L: prev feed with unread
      if (e.key === "L") {
        e.preventDefault();
        for (let i = feedIndex - 1; i >= 0; i--) {
          if ((unreadCounts[sortedFeeds[i].sub.id] || 0) > 0) {
            setFeedIndex(i);
            setSelectedFeedId(sortedFeeds[i].sub.id);
            return;
          }
        }
        return;
      }

      // g / ;: next/prev folder
      if (e.key === "g" || e.key === ";") {
        e.preventDefault();

        // Find current category from sortedFeeds (which tracks category per entry)
        const currentItem = sortedFeeds[feedIndex];
        const currentCat = currentItem?.category || "Uncategorized";
        const catIdx = sortedCategories.indexOf(currentCat);

        let targetCat: string | undefined;
        if (e.key === "g") {
          targetCat = sortedCategories[catIdx + 1];
        } else {
          targetCat = sortedCategories[catIdx - 1];
        }
        if (!targetCat) return;

        // Find first subscription in target category
        const targetSubIdx = sortedFeeds.findIndex((item) => item.category === targetCat);
        if (targetSubIdx >= 0) {
          setFeedIndex(targetSubIdx);
          setSelectedFeedId(sortedFeeds[targetSubIdx].sub.id);
        }
        return;
      }

      // x: toggle current folder open/close
      if (e.key === "x") {
        e.preventDefault();
        const currentItem = sortedFeeds[feedIndex];
        const folderLabel = currentItem?.category || "Uncategorized";
        setCollapsedFolders((prev) => {
          const next = { ...prev, [folderLabel]: !prev[folderLabel] };
          fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: "collapsed-folders", value: JSON.stringify(next) }),
          });
          return next;
        });
        return;
      }
    }
    window.addEventListener("keydown", handleFeedNav);
    return () => window.removeEventListener("keydown", handleFeedNav);
  }, [sortedFeeds, sortedCategories, feedIndex, unreadCounts, refreshFeed, entries, selectedIndex, showSearch]);

  const handleSearchSelect = useCallback((entry: FeedlyEntry) => {
    setDetailOverride(entry);
    setShowSearch(false);
  }, []);

  const handleSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
    setDetailOverride(null); // Clear search result override on normal navigation
  }, []);

  const handleSelectFeed = useCallback(
    (feedId: string, category?: string) => {
      setSelectedFeedId(feedId);
      setDetailOverride(null); // Clear search result override on feed switch
      // Find the exact position matching both feedId and category
      const idx = category
        ? sortedFeeds.findIndex((s) => s.sub.id === feedId && s.category === category)
        : sortedFeeds.findIndex((s) => s.sub.id === feedId);
      if (idx >= 0) setFeedIndex(idx);
    },
    [sortedFeeds]
  );

  const handleToggleUnreadOnly = useCallback(() => {
    setShowUnreadOnly((prev) => {
      const next = !prev;
      fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "unread-only", value: String(next) }),
      });
      return next;
    });
  }, []);

  const handleToggleStarredOnly = useCallback(() => {
    setShowStarredOnly((prev) => !prev);
  }, []);

  const handleToggleFolder = useCallback((label: string) => {
    setCollapsedFolders((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "collapsed-folders", value: JSON.stringify(next) }),
      });
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <p className="text-sm text-gray-500">
            Check your FEEDLY_ACCESS_TOKEN in .env.local
          </p>
        </div>
      </div>
    );
  }

  const filteredEntries = showStarredOnly
    ? entries.filter((e) => e.tags?.some((t) => t.id.includes("global.saved")))
    : entries;

  const selectedEntry = detailOverride || filteredEntries[selectedIndex] || null;

  return (
    <div className="flex h-screen">
      <FeedSidebar
        subscriptions={subscriptions}
        selectedFeedId={selectedFeedId}
        unreadCounts={unreadCounts}
        onSelectFeed={handleSelectFeed}
        showUnreadOnly={showUnreadOnly}
        onToggleUnreadOnly={handleToggleUnreadOnly}
        showStarredOnly={showStarredOnly}
        onToggleStarredOnly={handleToggleStarredOnly}
        collapsedFolders={collapsedFolders}
        onToggleFolder={handleToggleFolder}
      />
      <div className="w-[25%] min-w-[200px] flex-shrink-0 flex flex-col border-r">
        <div className="px-3 py-2 border-b bg-white flex-shrink-0">
          <h2 className="font-semibold text-gray-800 text-sm truncate">
            {subscriptions.find((s) => s.id === selectedFeedId)?.title ||
              "All Articles"}
          </h2>
          <p className="text-xs text-gray-500">
            {filteredEntries.length} articles{showStarredOnly ? " ★" : ""}
          </p>
        </div>
        <ArticleList
          entries={filteredEntries}
          selectedIndex={selectedIndex}
          onSelect={handleSelectIndex}
          onToggleStar={handleToggleStar}
          onToggleUnread={handleToggleUnread}
          fontSizeLevel={fontSizeLevel}
          disableKeyboard={showSearch}
        />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <ArticleDetail
          entry={selectedEntry}
          fontSizeLevel={fontSizeLevel}
        />
        <KeyboardHint />
      </div>

      {showSearch && (
        <SearchModal
          onClose={() => setShowSearch(false)}
          onSelectEntry={handleSearchSelect}
          streamIds={searchScope?.streamIds}
          scopeLabel={searchScope?.label}
        />
      )}

      {sitePreviewEntry && (
        <SitePreview
          entry={sitePreviewEntry}
          onClose={() => setSitePreviewEntry(null)}
          fontSizeLevel={fontSizeLevel}
        />
      )}
    </div>
  );
}
