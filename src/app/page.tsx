"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FeedlyEntry, FeedlySubscription } from "@/lib/feedly";
import { stripHtml } from "@/lib/html-strip";
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
  const [selectedFolderFeedIds, setSelectedFolderFeedIds] = useState<string[] | null>(null);
  const [selectedFolderLabel, setSelectedFolderLabel] = useState<string | null>(null);
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
  const [initialCrawlStatus, setInitialCrawlStatus] = useState<string | null>(null);
  const [feedPaneWidth, setFeedPaneWidth] = useState(280);
  const [articleListWidth, setArticleListWidth] = useState(512);
  const articleDetailRef = useRef<ArticleDetailHandle>(null);

  // Full-text extraction state
  const [extractedContent, setExtractedContent] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Translation state
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);
  const [translateMenuPos, setTranslateMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [translating, setTranslating] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);

  // AI menu state
  const [showAIMenu, setShowAIMenu] = useState(false);
  const [aiMenuPos, setAiMenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Unified search state
  const [searchTarget, setSearchTarget] = useState<"feed" | "article">("article");
  const [feedFilterQuery, setFeedFilterQuery] = useState("");
  const [articleSearchQuery, setArticleSearchQuery] = useState("");
  const [readStatusFilter, setReadStatusFilter] = useState<"all" | "unread" | "read">("all");
  const [userTags, setUserTags] = useState<{id: number; name: string; color: string}[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);

  // Compute feed order matching feed pane display (with duplicates for multi-category feeds)
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

    // Flatten into ordered list matching feed pane order (duplicates preserved)
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
        // Fetch auth, preferences, and RSS feeds all in parallel
        const [meRes, prefsRes, rssRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/preferences"),
          fetch("/api/rss/feeds"),
        ]);

        const me = await meRes.json();
        if (!me.ok) {
          router.push("/login");
          return;
        }
        setUsername(me.username);

        // Apply preferences
        const prefs = await prefsRes.json();
        if (prefs["font-size-level"]) {
          const level = parseInt(prefs["font-size-level"], 10);
          if (level >= 0 && level <= 4) setFontSizeLevel(level);
        }
        if (prefs["collapsed-folders"]) {
          try {
            setCollapsedFolders(JSON.parse(prefs["collapsed-folders"]));
          } catch { /* ignore parse errors */ }
        }
        if (prefs["search-target"]) {
          const t = prefs["search-target"];
          if (t === "feed" || t === "article") setSearchTarget(t);
        }
        if (prefs["read-status-filter"]) {
          const f = prefs["read-status-filter"];
          if (f === "all" || f === "unread" || f === "read") setReadStatusFilter(f);
        }

        // Apply RSS feeds
        const countMap: Record<string, number> = {};
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

          // Initial crawl if user has feeds but no cached entries yet
          if (rssFeeds.length > 0 && Object.keys(countMap).length === 0) {
            setInitialCrawlStatus("登録されたフィードのアーティクルを取得しています......");
            fetch("/api/rss/crawl", { method: "POST" }).then(async (crawlRes) => {
              const crawlData = await crawlRes.json();
              setInitialCrawlStatus(
                `${crawlData.crawled || 0}件のフィードから${crawlData.newEntries || 0}件の記事を取得しました\nフルテキストを取得中......`
              );
              const refreshRes = await fetch("/api/rss/feeds");
              if (refreshRes.ok) {
                const refreshed = await refreshRes.json();
                const newCounts: Record<string, number> = {};
                for (const f of refreshed) {
                  if (f.unread_count != null) newCounts[f.id] = f.unread_count;
                }
                setUnreadCounts(newCounts);
              }
              setInitialCrawlStatus(null);
            }).catch(() => setInitialCrawlStatus(null));
          }
        }
        setUnreadCounts(countMap);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Fetch user tags
  useEffect(() => {
    fetch("/api/rss/tags")
      .then(r => r.json())
      .then(tags => { if (Array.isArray(tags)) setUserTags(tags); })
      .catch(() => {});
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

  // Load entries when feed or folder changes
  useEffect(() => {
    const feedIds = selectedFolderFeedIds || (selectedFeedId ? [selectedFeedId] : null);
    if (!feedIds || feedIds.length === 0) return;

    async function loadEntries() {
      try {
        const params = feedIds!.map(id => `streamId=${encodeURIComponent(id)}`).join("&");
        const res = await fetch(`/api/rss/streams?${params}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const items = data.items || [];
        setEntries(showUnreadOnly ? items.filter((e: FeedlyEntry) => e.unread) : items);
        setSelectedIndex(-1);
      } catch {
        // Server-side SQLite fallback handles this
      }
    }
    loadEntries();
  }, [selectedFeedId, selectedFolderFeedIds, showUnreadOnly]);

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
    () => {
      let result = entries;
      if (showStarredOnly) {
        result = result.filter((e) => e.tags?.some((t) => t.id.includes("global.saved")));
      }
      if (readStatusFilter === "unread") {
        result = result.filter((e) => e.unread);
      } else if (readStatusFilter === "read") {
        result = result.filter((e) => !e.unread);
      }
      return result;
    },
    [entries, showStarredOnly, readStatusFilter]
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

  // Auto-extract full text for all articles
  useEffect(() => {
    setExtractedContent(null);
    setExtracting(false);
    setExtractError(null);

    if (!selectedEntry || !selectedEntryUrl) return;

    let cancelled = false;
    doExtract(selectedEntryUrl, () => cancelled);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry?.id, doExtract]);



  // Clear translation when article changes
  useEffect(() => {
    setTranslatedContent(null);
    setShowTranslateMenu(false);
  }, [selectedEntry?.id]);

  // Translation handler
  const handleTranslate = useCallback(async (service: "ai" | "deepl" | "google") => {
    if (!selectedEntry) return;
    const content = extractedContent || selectedEntry.content?.content || selectedEntry.summary?.content || "";
    if (!content) return;

    if (service === "google") {
      // Open Google Translate in new tab
      const url = selectedEntry.alternate?.[0]?.href;
      if (url) {
        window.open(`https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(url)}`, "_blank");
      }
      return;
    }

    if (service === "deepl") {
      // Open DeepL with text (limited to ~5000 chars)
      const text = stripHtml(content).slice(0, 5000);
      window.open(`https://www.deepl.com/translator#en/ja/${encodeURIComponent(text)}`, "_blank");
      return;
    }

    // AI translation via chat API
    setTranslating(true);
    try {
      const textContent = stripHtml(content).slice(0, 8000);
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: `以下の記事を日本語に翻訳してください。HTMLタグは使わず、プレーンテキストで出力してください。\n\n${textContent}` },
          ],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTranslatedContent(data.content || data.message);
    } catch {
      setTranslatedContent("翻訳に失敗しました。AIモデルの設定を確認してください。");
    } finally {
      setTranslating(false);
    }
  }, [selectedEntry, extractedContent]);

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
      // Update feed pane unread count immediately
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
    setSyncing(true);
    try {
      // Crawl selected feed or all feeds
      await fetch("/api/rss/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedFeedId ? { feedId: selectedFeedId } : {}),
      }).catch(() => {});

      // Reload entries for current view
      const feedIds = selectedFolderFeedIds || (selectedFeedId ? [selectedFeedId] : null);
      if (feedIds && feedIds.length > 0) {
        const params = feedIds.map(id => `streamId=${encodeURIComponent(id)}`).join("&");
        const streamRes = await fetch(`/api/rss/streams?${params}`);
        const data = await streamRes.json();
        if (data.error) throw new Error(data.error);
        const items = data.items || [];
        setEntries(showUnreadOnly ? items.filter((e: FeedlyEntry) => e.unread) : items);
        setSelectedIndex(-1);
      }

      // Reload unread counts
      const feedsRes = await fetch("/api/rss/feeds");
      const feeds = await feedsRes.json();
      const countMap: Record<string, number> = {};
      for (const f of feeds) {
        if (f.unread_count != null) countMap[f.id] = f.unread_count;
      }
      setUnreadCounts(countMap);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : "リフレッシュに失敗しました");
    } finally {
      setSyncing(false);
    }
  }, [selectedFeedId, selectedFolderFeedIds, showUnreadOnly]);

  // Refresh a specific feed (from context menu)
  const handleRefreshSingleFeed = useCallback(async (feedId: string) => {
    setSyncing(true);
    try {
      await fetch("/api/rss/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedId }),
      });
      // If the refreshed feed is currently selected, reload its entries
      if (feedId === selectedFeedId) {
        const streamRes = await fetch(`/api/rss/streams?streamId=${encodeURIComponent(feedId)}`);
        const data = await streamRes.json();
        if (!data.error) {
          const items = data.items || [];
          setEntries(showUnreadOnly ? items.filter((e: FeedlyEntry) => e.unread) : items);
        }
      }
      // Reload unread counts
      const feedsRes = await fetch("/api/rss/feeds");
      const feeds = await feedsRes.json();
      const countMap: Record<string, number> = {};
      for (const f of feeds) {
        if (f.unread_count != null) countMap[f.id] = f.unread_count;
      }
      setUnreadCounts(countMap);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : "更新に失敗しました");
    } finally {
      setSyncing(false);
    }
  }, [selectedFeedId, showUnreadOnly]);

  // Delete a feed (from context menu)
  const handleDeleteFeed = useCallback(async (feedId: string) => {
    try {
      await fetch(`/api/rss/feeds?feedId=${encodeURIComponent(feedId)}`, { method: "DELETE" });
      setSubscriptions(prev => prev.filter(s => s.id !== feedId));
      if (selectedFeedId === feedId) {
        setSelectedFeedId(null);
        setEntries([]);
      }
    } catch (err) {
      setWarning(err instanceof Error ? err.message : "削除に失敗しました");
    }
  }, [selectedFeedId]);

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
        // Update feed pane unread count
        if (selectedFeedId) {
          setUnreadCounts((prev) => ({
            ...prev,
            [selectedFeedId]: 0,
          }));
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
        // Use selectedFolderLabel if a folder is selected, otherwise derive from current feed
        const folderLabel = selectedFolderLabel || sortedFeeds[feedIndex]?.category || "Uncategorized";
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
  }, [sortedFeeds, sortedCategories, feedIndex, unreadCounts, refreshFeed, entries, selectedIndex, showSearch, selectedFolderLabel]);

  const handleSearchSelect = useCallback((entry: FeedlyEntry) => {
    setDetailOverride(entry);
    setShowSearch(false);
  }, []);

  const handleSelectIndex = useCallback((index: number) => {
    setSelectedIndex(index);
    setDetailOverride(null); // Clear search result override on normal navigation
    // Focus the article pane so Space scrolls the article, not the feed pane
    requestAnimationFrame(() => articleDetailRef.current?.focus());
  }, []);

  const handleSelectFeed = useCallback(
    (feedId: string, category?: string) => {
      setSelectedFeedId(feedId);
      setSelectedFolderFeedIds(null);
      setSelectedFolderLabel(null);
      setDetailOverride(null);
      const idx = category
        ? sortedFeeds.findIndex((s) => s.sub.id === feedId && s.category === category)
        : sortedFeeds.findIndex((s) => s.sub.id === feedId);
      if (idx >= 0) setFeedIndex(idx);
    },
    [sortedFeeds]
  );

  const handleSelectFolder = useCallback(
    (feedIds: string[], folderLabel: string) => {
      setSelectedFeedId(null);
      setSelectedFolderFeedIds(feedIds);
      setSelectedFolderLabel(folderLabel);
      setDetailOverride(null);
      // Update feedIndex to the first feed in this folder so keyboard shortcuts (x, g, ;) work correctly
      const idx = sortedFeeds.findIndex((s) => s.category === folderLabel);
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

  const handleReorderFeeds = useCallback(async (updates: Array<{ feedId: string; sortOrder: number; category?: string }>) => {
    // Optimistically update subscriptions with new categories
    setSubscriptions(prev => {
      const updated = [...prev];
      for (const u of updates) {
        if (u.category !== undefined) {
          const idx = updated.findIndex(s => s.id === u.feedId);
          if (idx >= 0) {
            updated[idx] = {
              ...updated[idx],
              categories: [{ id: `rss-cat:${u.category}`, label: u.category }],
            };
          }
        }
      }
      return updated;
    });
    // Persist to server
    fetch("/api/rss/feeds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    }).catch(() => {});
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
      {initialCrawlStatus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-orange-500 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-900">初回セットアップ</p>
                <p className="text-xs text-gray-500 mt-1 whitespace-pre-line">{initialCrawlStatus}</p>
              </div>
            </div>
          </div>
        </div>
      )}
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
      <div className="flex flex-1 min-h-0 bg-white">
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
        onRefreshFeed={handleRefreshSingleFeed}
        onDeleteFeed={handleDeleteFeed}
        onSelectFolder={handleSelectFolder}
        selectedFolderLabel={selectedFolderLabel}
        filterQuery={feedFilterQuery}
        onReorderFeeds={handleReorderFeeds}
        userTags={userTags}
        selectedTagId={selectedTagId}
        onSelectTag={(tagId) => {
          setSelectedTagId(tagId);
          if (tagId) {
            fetch(`/api/rss/tags/entries?tagId=${tagId}`)
              .then(r => r.json())
              .then(entries => {
                if (Array.isArray(entries)) {
                  setEntries(entries);
                  setSelectedIndex(0);
                }
              })
              .catch(() => {});
          }
        }}
        onLogout={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          router.push("/login");
        }}
        width={feedPaneWidth}
      />
      <ResizeHandle onResize={(d) => setFeedPaneWidth((w) => Math.max(140, Math.min(500, w + d)))} />
      <div className="flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ width: `${articleListWidth}px`, minWidth: 160 }}>
        <div className="px-3 py-2 border-b border-orange-600 bg-orange-500 flex-shrink-0 min-h-[52px] flex flex-col justify-center">
          <h2 className="font-semibold text-white text-sm truncate">
            {selectedFolderLabel || subscriptions.find((s) => s.id === selectedFeedId)?.title ||
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
      <ResizeHandle onResize={(d) => setArticleListWidth((w) => Math.max(160, Math.min(600, w + d)))} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Article pane header: search + action icons */}
        <div className="px-3 py-2 border-b border-orange-600 bg-orange-500 flex-shrink-0 min-h-[52px] flex items-center gap-2">
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Refresh (force re-extract) */}
              <button
                onClick={() => { if (selectedEntryUrl) doExtract(selectedEntryUrl, undefined, true); }}
                className={`p-1.5 rounded transition-colors ${extracting ? "text-white bg-orange-600 animate-spin" : "text-white hover:bg-orange-600"}`}
                title="再取得"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>
              {/* AI menu */}
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setAiMenuPos({ x: rect.left, y: rect.bottom + 4 });
                  setShowAIMenu(prev => !prev);
                }}
                className={`px-1.5 py-0.5 rounded transition-colors font-bold text-xs ${showAIPanel || showAIMenu ? "text-white bg-orange-600" : "text-white hover:bg-orange-600"}`}
                title="AI 機能"
              >
                AI
              </button>
              {/* WebView */}
              <button
                onClick={() => setSitePreviewEntry(prev => prev?.id === selectedEntry?.id ? null : selectedEntry)}
                className={`p-1.5 rounded transition-colors ${sitePreviewEntry ? "text-white bg-orange-600" : "text-white hover:bg-orange-600"}`}
                title="WebView"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </button>
              {/* Translate */}
              <button
                ref={(el) => { if (el) el.dataset.translateBtn = "1"; }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTranslateMenuPos({ x: rect.right, y: rect.bottom + 4 });
                  setShowTranslateMenu(prev => !prev);
                }}
                className={`p-1.5 rounded transition-colors ${translating ? "text-white bg-orange-600" : "text-white hover:bg-orange-600"}`}
                title="翻訳"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/>
                </svg>
              </button>
              {/* Open in new tab */}
              {selectedEntryUrl ? (
                <a
                  href={selectedEntryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-white hover:bg-orange-600 rounded transition-colors"
                  title="別タブで開く"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              ) : (
                <span
                  className="p-1.5 text-white opacity-40 cursor-not-allowed rounded"
                  title="別タブで開く"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </span>
              )}
            </div>
          {/* Search target selector */}
          <div className="flex bg-orange-600 text-[10px] font-medium ml-auto flex-shrink-0">
            {([["feed", "FEED"], ["article", "ARTICLE"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setSearchTarget(key); fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "search-target", value: key }) }); }}
                className={`px-2 py-0.5 transition-colors ${searchTarget === key ? "bg-white text-orange-600" : "text-white/90 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Read status filter */}
          <div className="flex bg-orange-600 text-[10px] font-medium flex-shrink-0">
            {([["all", "ALL"], ["unread", "UNREAD"], ["read", "READ"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setReadStatusFilter(key); fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "read-status-filter", value: key }) }); }}
                className={`px-2 py-0.5 transition-colors ${readStatusFilter === key ? "bg-white text-orange-600" : "text-white/90 hover:text-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Search input */}
          <div className="relative flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={searchTarget === "feed" ? feedFilterQuery : articleSearchQuery}
              onChange={(e) => searchTarget === "feed" ? setFeedFilterQuery(e.target.value) : setArticleSearchQuery(e.target.value)}
              className="w-52 pl-7 pr-2 py-1 text-sm bg-white text-gray-800 border border-orange-300 rounded focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
          </div>
        </div>
        <div className={showAIPanel ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "flex-1 flex flex-col min-w-0 overflow-hidden"}>
          <ArticleDetail
            ref={articleDetailRef}
            entry={selectedEntry}
            fontSizeLevel={fontSizeLevel}
            extractedContent={extractedContent}
            extracting={extracting}
            extractError={extractError}
            translatedContent={translatedContent}
            translating={translating}
            searchQuery={articleSearchQuery}
            onSelectLookalike={(entry) => {
              setDetailOverride(entry);
            }}
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

      {showAIMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowAIMenu(false)} />
          <div
            className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[180px]"
            style={{ left: aiMenuPos.x, top: aiMenuPos.y }}
          >
            <div className="px-3 py-1.5 text-xs text-gray-400">AI 機能</div>
            <hr className="border-gray-100" />
            <button
              onClick={() => { setShowAIPanel(prev => !prev); setShowAIMenu(false); }}
              className="w-full text-left px-3 py-1.5 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
            >
              チャット（自由質問）
            </button>
            <button
              onClick={() => {
                if (!selectedEntry) return;
                const content = extractedContent || selectedEntry.content?.content || selectedEntry.summary?.content || "";
                const text = stripHtml(content).slice(0, 8000);
                setShowAIPanel(true);
                setShowAIMenu(false);
                // Dispatch a custom event for AIPanel to pick up the prompt
                window.dispatchEvent(new CustomEvent("ai-prompt", { detail: { prompt: `以下の記事を日本語で3〜5文で要約してください。\n\n${text}` } }));
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
            >
              要約
            </button>
            <button
              onClick={() => {
                if (!selectedEntry) return;
                const content = extractedContent || selectedEntry.content?.content || selectedEntry.summary?.content || "";
                const text = stripHtml(content).slice(0, 8000);
                setShowAIPanel(true);
                setShowAIMenu(false);
                window.dispatchEvent(new CustomEvent("ai-prompt", { detail: { prompt: `以下の記事のキーポイントを箇条書きで抽出してください。\n\n${text}` } }));
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
            >
              キーポイント抽出
            </button>
            <button
              onClick={() => {
                if (!selectedEntry) return;
                const content = extractedContent || selectedEntry.content?.content || selectedEntry.summary?.content || "";
                const text = stripHtml(content).slice(0, 8000);
                setShowAIPanel(true);
                setShowAIMenu(false);
                window.dispatchEvent(new CustomEvent("ai-prompt", { detail: { prompt: `以下の記事と似たテーマの記事やリソースを提案してください（ルックアライク）。記事のトピック、キーワード、関連分野を分析して、おすすめを5つ挙げてください。\n\n${text}` } }));
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
            >
              ルックアライク
            </button>
          </div>
        </>
      )}

      {showTranslateMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowTranslateMenu(false)} />
          <div
            className="fixed z-50 bg-white rounded-md shadow-lg border border-gray-200 py-1 min-w-[140px]"
            style={{ left: translateMenuPos.x - 140, top: translateMenuPos.y }}
          >
            {([["ai", "AI 翻訳"], ["deepl", "DeepL"], ["google", "Google 翻訳"]] as const).map(([service, label]) => (
              <button
                key={service}
                onClick={() => { handleTranslate(service); setShowTranslateMenu(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-orange-500 hover:bg-orange-50 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

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
