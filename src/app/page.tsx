"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedlyEntry, FeedlySubscription } from "@/lib/feedly";
import FeedSidebar from "@/components/FeedSidebar";
import ArticleList from "@/components/ArticleList";
import ArticleDetail, { type ArticleDetailHandle } from "@/components/ArticleDetail";
import SitePreview from "@/components/SitePreview";
import SearchModal from "@/components/SearchModal";
import KeyboardHint from "@/components/KeyboardHint";
import AIPanel from "@/components/AIPanel";
import ResizeHandle from "@/components/ResizeHandle";

export default function Home() {
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [subscriptions, setSubscriptions] = useState<FeedlySubscription[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<FeedlyEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [feedIndex, setFeedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [fontSizeLevel, setFontSizeLevel] = useState(1); // 0-4: xs, sm, base, lg, xl
  const [sitePreviewEntry, setSitePreviewEntry] = useState<FeedlyEntry | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchScope, setSearchScope] = useState<{ streamIds: string[]; label: string } | null>(null);
  const [detailOverride, setDetailOverride] = useState<FeedlyEntry | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [listWidth, setListWidth] = useState(512);
  const articleDetailRef = useRef<ArticleDetailHandle>(null);

  // Full-text extraction state
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

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
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const item of sortedFeeds) {
      if (seen.has(item.category)) continue;
      seen.add(item.category);
      ordered.push(item.category);
    }
    return ordered;
  }, [sortedFeeds]);

  // Load subscriptions, unread counts, and preferences
  useEffect(() => {
    async function load() {
      try {
        // Check auth state first
        const meRes = await fetch("/api/auth/me");
        const me = await meRes.json();
        if (!me.ok) {
          router.push("/login");
          return;
        }
        setUsername(me.username);

        // Fetch preferences first (always needed)
        const prefsRes = await fetch("/api/preferences");
        const prefs = await prefsRes.json();

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

        // Fetch RSS feeds
        const countMap: Record<string, number> = {};
        try {
          const rssRes = await fetch("/api/rss/feeds");
          if (rssRes.ok) {
            const rssFeeds = await rssRes.json();
            const rssSubs: FeedlySubscription[] = rssFeeds.map((f: { id: string; title?: string; feed_url: string; site_url?: string; category?: string; unread_count?: number }) => ({
              id: f.id,
              title: f.title || f.feed_url,
              website: f.site_url || "",
              categories: [{ id: `rss-cat:${f.category || "RSS"}`, label: f.category || "RSS" }],
            }));
            for (const f of rssFeeds) {
              if (f.unread_count != null) {
                countMap[f.id] = f.unread_count;
              }
            }
            setSubscriptions(rssSubs);
          }
        } catch { /* RSS fetch failed */ }

        setUnreadCounts(countMap);

        // Background crawl all feeds for search index
        fetch("/api/rss/crawl", { method: "POST" }).catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Auto-refresh every 10 minutes
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch("/api/rss/crawl", { method: "POST" });
        // Reload unread counts
        const rssRes = await fetch("/api/rss/feeds");
        if (rssRes.ok) {
          const rssFeeds = await rssRes.json();
          const countMap: Record<string, number> = {};
          for (const f of rssFeeds) {
            if (f.unread_count != null) countMap[f.id] = f.unread_count;
          }
          setUnreadCounts(countMap);
        }
      } catch { /* ignore */ }
    }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Load entries when feed changes (SQLite fallback handled server-side)
  useEffect(() => {
    if (!selectedFeedId) return;

    async function loadEntries() {
      try {
        const url = `/api/rss/streams?streamId=${encodeURIComponent(selectedFeedId!)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const items = data.items || [];
        // Client-side filter as safety net when unread-only mode
        setEntries(showUnreadOnly ? items.filter((e: FeedlyEntry) => e.unread) : items);
        setSelectedIndex(-1);
      } catch {
        // Server-side SQLite fallback handles this
      }
    }
    loadEntries();
  }, [selectedFeedId, showUnreadOnly]);

  // Mark as read when selecting an article (only on index change, not entries change)
  useEffect(() => {
    const entry = entries[selectedIndex];
    if (entry?.unread) {
      // Update UI immediately
      setEntries((prev) =>
        prev.map((e, i) => (i === selectedIndex ? { ...e, unread: false } : e))
      );
      const feedId = entry.origin?.streamId;
      if (feedId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [feedId]: Math.max(0, (prev[feedId] || 0) - 1),
        }));
      }
      // Mark as read in local DB
      fetch("/api/rss/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "markAsRead",
          entryIds: [entry.id],
          feedId: entry.origin?.streamId,
        }),
        keepalive: true,
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex]);

  // Update preview when selectedIndex changes (j/k navigation while preview is open)
  useEffect(() => {
    const entry = entries[selectedIndex];
    if (!entry) return;
    if (sitePreviewEntry) setSitePreviewEntry(entry);
  }, [selectedIndex, entries]);

  // Compute selected entry (used for extraction and rendering)
  const filteredEntries = useMemo(
    () =>
      showStarredOnly
        ? entries.filter((e) => e.tags?.some((t) => t.id.includes("global.saved")))
        : entries,
    [entries, showStarredOnly]
  );
  const selectedEntry = detailOverride || filteredEntries[selectedIndex] || null;
  const selectedEntryUrl = selectedEntry?.alternate?.[0]?.href ?? null;

  // Shared extraction fetch logic
  const doExtract = useCallback(
    (url: string, onCancel?: () => boolean, force?: boolean) => {
      setExtracting(true);
      setExtractError(null);

      const params = new URLSearchParams({ url });
      if (force) params.set("force", "1");

      fetch(`/api/extract?${params}`)
        .then((r) => r.json())
        .then((data) => {
          if (onCancel?.()) return;
          if (data.error) {
            setExtractError(data.error);
          } else {
            setExtractedContent(data.content);
          }
        })
        .catch((err) => {
          if (onCancel?.()) return;
          setExtractError(err instanceof Error ? err.message : "Extraction failed");
        })
        .finally(() => {
          if (!onCancel?.()) setExtracting(false);
        });
    },
    []
  );

  // Auto-extract full text when article only has summary
  useEffect(() => {
    setExtractedContent(null);
    setExtracting(false);
    setExtractError(null);

    if (!selectedEntry || selectedEntry.content?.content || !selectedEntryUrl) return;

    let cancelled = false;
    doExtract(selectedEntryUrl, () => cancelled);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry?.id, doExtract]);

  // Manual extraction trigger
  const handleExtractFullText = useCallback(() => {
    if (!selectedEntryUrl) return;
    doExtract(selectedEntryUrl);
  }, [selectedEntryUrl, doExtract]);

  const handleToggleUnread = useCallback(
    (entry: FeedlyEntry) => {
      const action = entry.unread ? "markAsRead" : "keepUnread";
      fetch("/api/rss/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entryIds: [entry.id], feedId: entry.origin?.streamId }),
        keepalive: true,
      }).catch(() => {});
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id ? { ...e, unread: !e.unread } : e
        )
      );
      // Update sidebar unread count immediately
      const feedId = entry.origin?.streamId;
      if (feedId) {
        const delta = entry.unread ? -1 : 1;
        setUnreadCounts((prev) => ({
          ...prev,
          [feedId]: Math.max(0, (prev[feedId] || 0) + delta),
        }));
      }
    },
    []
  );

  const handleToggleStar = useCallback(
    (entry: FeedlyEntry) => {
      const isStarred = entry.tags?.some((t) => t.id.includes("global.saved"));
      fetch("/api/rss/markers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isStarred ? "unstar" : "star",
          entryIds: [entry.id],
        }),
      }).catch(() => {});
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

  // Refresh current feed (R key or sync button)
  const refreshFeed = useCallback(async () => {
    if (!selectedFeedId) return;
    setSyncing(true);
    try {
      // Crawl only the selected feed, then reload stream
      await fetch("/api/rss/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedId: selectedFeedId }),
      }).catch(() => {});
      const streamRes = await fetch(`/api/rss/streams?streamId=${encodeURIComponent(selectedFeedId)}`);
      const data = await streamRes.json();
      if (data.error) throw new Error(data.error);
      const items = data.items || [];
      setEntries(showUnreadOnly ? items.filter((e: FeedlyEntry) => e.unread) : items);
      setSelectedIndex(-1);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : "リフレッシュに失敗しました");
    } finally {
      setSyncing(false);
    }
  }, [selectedFeedId, showUnreadOnly]);

  // Keyboard navigation for feeds, folders, and refresh
  useEffect(() => {
    function handleFeedNav(e: KeyboardEvent) {
      // Suppress all shortcuts while search modal is open
      if (showSearch) return;

      // a: toggle AI panel
      if (e.key === "a") {
        // Don't trigger if user is typing in an input
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
        e.preventDefault();
        setShowAIPanel(prev => !prev);
        return;
      }

      // A (Shift+A): mark all articles in current feed as read
      if (e.key === "A") {
        e.preventDefault();
        const unreadEntries = entries.filter((en) => en.unread);
        if (unreadEntries.length === 0) return;
        const feedTitle = subscriptions.find((s) => s.id === selectedFeedId)?.title || "このフィード";
        if (!window.confirm(`「${feedTitle}」の未読 ${unreadEntries.length} 件をすべて既読にしますか？`)) return;
        const entryIds = unreadEntries.map((en) => en.id);
        fetch("/api/rss/markers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "markAsRead", entryIds }),
        }).catch(() => {});
        setEntries((prev) => prev.map((en) => ({ ...en, unread: false })));
        // Update sidebar unread count
        if (selectedFeedId) {
          setUnreadCounts((prev) => ({
            ...prev,
            [selectedFeedId]: 0,
          }));
        }
        return;
      }

      // e: extract full text, E: force re-extract (skip cache)
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        if (selectedEntryUrl) {
          const force = e.key === "E";
          doExtract(selectedEntryUrl, undefined, force);
        }
        return;
      }

      // u: toggle unread-only filter
      if (e.key === "u") {
        e.preventDefault();
        handleToggleUnreadOnly();
        return;
      }

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
      if (e.key === "h") {
        e.preventDefault();
        const next = Math.min(feedIndex + 1, sortedFeeds.length - 1);
        setFeedIndex(next);
        setSelectedFeedId(sortedFeeds[next].sub.id);
        return;
      }

      // l: prev feed
      if (e.key === "l") {
        e.preventDefault();
        const prev = Math.max(feedIndex - 1, 0);
        setFeedIndex(prev);
        setSelectedFeedId(sortedFeeds[prev].sub.id);
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
    // Focus the detail pane so Space scrolls the article, not the sidebar
    requestAnimationFrame(() => articleDetailRef.current?.focus());
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
            設定を確認してください
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {warning && (
        <div className="flex items-center justify-between px-4 py-2 bg-orange-900/90 text-orange-200 text-sm flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0">&#9888;</span>
            <span>{warning}</span>
          </div>
          <button
            onClick={() => setWarning(null)}
            className="text-orange-400 hover:text-orange-200 ml-4 flex-shrink-0"
          >
            &#10005;
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
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
        username={username}
        syncing={syncing}
        onSync={refreshFeed}
        onSettings={() => router.push("/setup")}
        onLogout={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/login");
        }}
        width={sidebarWidth}
      />
      <ResizeHandle onResize={(d) => setSidebarWidth((w) => Math.max(140, Math.min(500, w + d)))} />
      <div className="flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ width: `${listWidth}px`, minWidth: 160 }}>
        <div className="px-3 py-2 border-b border-orange-600 bg-orange-500 flex-shrink-0">
          <h2 className="font-semibold text-white text-sm truncate">
            {subscriptions.find((s) => s.id === selectedFeedId)?.title ||
              "All Articles"}
          </h2>
          <p className="text-xs text-orange-100">
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
      <ResizeHandle onResize={(d) => setListWidth((w) => Math.max(160, Math.min(600, w + d)))} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className={showAIPanel ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "flex-1 flex flex-col min-w-0 overflow-hidden"}>
          <ArticleDetail
            ref={articleDetailRef}
            entry={selectedEntry}
            fontSizeLevel={fontSizeLevel}
            extractedContent={extractedContent}
            extracting={extracting}
            extractError={extractError}
            onExtractFullText={handleExtractFullText}
          />
        </div>
        {showAIPanel && (
          <AIPanel
            articleContent={extractedContent || selectedEntry?.content?.content || selectedEntry?.summary?.content || ""}
            articleTitle={selectedEntry?.title || ""}
            onClose={() => setShowAIPanel(false)}
          />
        )}
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
    </div>
  );
}
