"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoWithText } from "@/components/Logo";

export default function SetupPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  // RSS feed management state
  const [feedUrl, setFeedUrl] = useState("");
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedMessage, setFeedMessage] = useState("");
  const [feedMessageType, setFeedMessageType] = useState<"success" | "error">("success");
  const [rssFeeds, setRssFeeds] = useState<Array<{id: string, title: string | null, feed_url: string}>>([]);
  const [importResult, setImportResult] = useState("");
  const [selectedFeeds, setSelectedFeeds] = useState<Set<string>>(new Set());
  const [opmlPreview, setOpmlPreview] = useState<Array<{title: string, feedUrl: string, category: string}>>([]);
  const [opmlSelected, setOpmlSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [opmlText, setOpmlText] = useState("");

  // Fetch RSS feeds on mount
  useEffect(() => {
    fetch("/api/rss/feeds").then(r => r.json()).then(setRssFeeds).catch(() => {});
  }, []);

  // Add RSS feed
  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setAddingFeed(true);
    setFeedMessage("");
    try {
      const res = await fetch("/api/rss/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "追加に失敗しました");
      setFeedMessage(`「${data.title || data.feed_url}」を追加しました`);
      setFeedMessageType("success");
      setFeedUrl("");
      // Reload feeds
      const feeds = await fetch("/api/rss/feeds").then(r => r.json());
      setRssFeeds(feeds);
    } catch (err) {
      setFeedMessage(err instanceof Error ? err.message : "追加に失敗しました");
      setFeedMessageType("error");
    } finally {
      setAddingFeed(false);
    }
  }

  // Delete RSS feed
  async function handleDeleteFeed(feedId: string) {
    try {
      await fetch("/api/rss/feeds", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedId }),
      });
      setRssFeeds(prev => prev.filter(f => f.id !== feedId));
      setSelectedFeeds(prev => { const next = new Set(prev); next.delete(feedId); return next; });
    } catch {}
  }

  // Delete selected feeds
  async function handleDeleteSelected() {
    if (selectedFeeds.size === 0) return;
    if (!confirm(`${selectedFeeds.size}件のフィードを削除しますか？`)) return;
    for (const feedId of selectedFeeds) {
      try {
        await fetch("/api/rss/feeds", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedId }),
        });
      } catch {}
    }
    setRssFeeds(prev => prev.filter(f => !selectedFeeds.has(f.id)));
    setSelectedFeeds(new Set());
  }

  function toggleFeedSelection(feedId: string) {
    setSelectedFeeds(prev => {
      const next = new Set(prev);
      if (next.has(feedId)) next.delete(feedId);
      else next.add(feedId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedFeeds.size === rssFeeds.length) {
      setSelectedFeeds(new Set());
    } else {
      setSelectedFeeds(new Set(rssFeeds.map(f => f.id)));
    }
  }

  // OPML preview: parse and show selectable list
  async function handleOPMLPreview(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setOpmlText(text);
    try {
      const res = await fetch("/api/rss/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opml: text, preview: true }),
      });
      const data = await res.json();
      setOpmlPreview(data.items || []);
      // Select all by default
      setOpmlSelected(new Set(data.items.map((_: unknown, i: number) => i)));
      setImportResult("");
    } catch {
      setImportResult("OPMLの読み込みに失敗しました");
    }
    // Reset file input
    e.target.value = "";
  }

  // OPML import: import selected feeds
  async function handleOPMLImport() {
    if (opmlSelected.size === 0) return;
    setImporting(true);
    try {
      const selectedFeedUrls = opmlPreview
        .filter((_, i) => opmlSelected.has(i))
        .map(item => item.feedUrl);
      const res = await fetch("/api/rss/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opml: opmlText, selectedUrls: selectedFeedUrls }),
      });
      const data = await res.json();
      setImportResult(`${data.imported}件インポート、${data.skipped}件スキップ`);
      setOpmlPreview([]);
      setOpmlSelected(new Set());
      setOpmlText("");
      // Reload feeds
      const feeds = await fetch("/api/rss/feeds").then(r => r.json());
      setRssFeeds(feeds);
    } catch {
      setImportResult("インポートに失敗しました");
    } finally {
      setImporting(false);
    }
  }

  // Build bookmarklet href (needs window.location.origin)
  const bookmarkletOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const bookmarkletHref = `javascript:void(fetch('${bookmarkletOrigin}/api/rss/feeds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:location.href}),credentials:'include'}).then(r=>r.json()).then(d=>alert(d.error?'Error: '+d.error:'Added: '+(d.title||d.feed_url))).catch(()=>alert('Failed to add feed')))`;

  return (
    <div className="min-h-screen bg-orange-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-center mb-4">
          <LogoWithText size={36} />
        </div>
        <h2 className="text-base font-medium text-orange-600 text-center mb-4">
          Freeder 設定
        </h2>

        {/* Go to main page button */}
        <button
          onClick={() => router.push("/")}
          className="w-full py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-md text-sm mb-4 transition-colors"
        >
          &larr; メインページへ
        </button>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        {/* === RSSフィード管理 === */}
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4 mb-5">
          <h3 className="text-sm font-medium text-orange-800 mb-3">RSSフィード管理</h3>

          {/* フィードURL追加 */}
          <form onSubmit={handleAddFeed} className="flex gap-2 mb-3">
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml or サイトURL"
              className="flex-1 px-3 py-2 bg-white border border-orange-300 rounded-md text-gray-800 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
            />
            <button
              type="submit"
              disabled={addingFeed || !feedUrl.trim()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
            >
              {addingFeed ? "追加中..." : "追加"}
            </button>
          </form>

          {/* フィード追加結果メッセージ */}
          {feedMessage && (
            <p className={`text-sm mb-3 ${feedMessageType === "success" ? "text-green-600" : "text-red-500"}`}>
              {feedMessage}
            </p>
          )}

          {/* 登録済みフィード一覧 */}
          {rssFeeds.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs text-orange-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedFeeds.size === rssFeeds.length && rssFeeds.length > 0}
                    onChange={toggleSelectAll}
                    className="accent-orange-500"
                  />
                  全選択 ({rssFeeds.length}件)
                </label>
                {selectedFeeds.size > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    選択を削除 ({selectedFeeds.size})
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {rssFeeds.map((feed) => (
                  <div key={feed.id} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-orange-200 rounded text-sm">
                    <input
                      type="checkbox"
                      checked={selectedFeeds.has(feed.id)}
                      onChange={() => toggleFeedSelection(feed.id)}
                      className="accent-orange-500 flex-shrink-0"
                    />
                    <span className="text-gray-700 truncate flex-1">{feed.title || feed.feed_url}</span>
                    <button
                      onClick={() => handleDeleteFeed(feed.id)}
                      className="text-orange-300 hover:text-red-500 flex-shrink-0 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* === OPMLインポート === */}
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4 mb-5">
          <h3 className="text-sm font-medium text-orange-800 mb-1">OPMLインポート</h3>
          <p className="text-xs text-orange-600/70 mb-3">
            FeedlyやほかのRSSリーダーからエクスポートしたOPMLファイルを読み込みます
          </p>
          <input
            type="file"
            accept=".opml,.xml"
            onChange={handleOPMLPreview}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-orange-500 file:text-white hover:file:bg-orange-600 file:transition-colors"
          />

          {/* OPML preview list */}
          {opmlPreview.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs text-orange-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opmlSelected.size === opmlPreview.length}
                    onChange={() => {
                      if (opmlSelected.size === opmlPreview.length) {
                        setOpmlSelected(new Set());
                      } else {
                        setOpmlSelected(new Set(opmlPreview.map((_, i) => i)));
                      }
                    }}
                    className="accent-orange-500"
                  />
                  全選択 ({opmlPreview.length}件)
                </label>
                <span className="text-xs text-orange-600">
                  {opmlSelected.size}件選択中
                </span>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {opmlPreview.map((item, i) => (
                  <label key={i} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-orange-200 rounded text-sm cursor-pointer hover:bg-orange-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={opmlSelected.has(i)}
                      onChange={() => {
                        setOpmlSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                      className="accent-orange-500 flex-shrink-0"
                    />
                    <span className="text-gray-700 truncate flex-1">{item.title || item.feedUrl}</span>
                    {item.category && (
                      <span className="text-xs text-orange-400 flex-shrink-0">{item.category}</span>
                    )}
                  </label>
                ))}
              </div>
              <button
                onClick={handleOPMLImport}
                disabled={importing || opmlSelected.size === 0}
                className="w-full mt-3 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors"
              >
                {importing ? "インポート中..." : `${opmlSelected.size}件をインポート`}
              </button>
            </div>
          )}

          {importResult && (
            <p className="text-sm mt-2 text-green-600">{importResult}</p>
          )}
        </div>

        {/* === ブックマークレット === */}
        <div className="bg-orange-50 border border-orange-200 rounded-md p-4 mb-5">
          <h3 className="text-sm font-medium text-orange-800 mb-1">ブックマークレット</h3>
          <p className="text-xs text-orange-600/70 mb-3">
            下のボタンをブックマークバーにドラッグ&ドロップすると、ブラウザで見ているサイトをワンクリックでRSS登録できます
          </p>
          <a
            href={bookmarkletHref}
            className="inline-block px-4 py-2 bg-orange-500 text-white rounded-md text-sm font-medium cursor-grab hover:bg-orange-600 transition-colors"
            onClick={(e) => { e.preventDefault(); alert("このボタンをブックマークバーにドラッグ&ドロップしてください"); }}
          >
            📰 Freederに追加
          </a>

          <details className="mt-4">
            <summary className="text-xs text-orange-500 cursor-pointer hover:text-orange-700">
              ブラウザ別の登録方法を見る
            </summary>
            <div className="mt-2 space-y-3 text-xs text-gray-600">
              <div>
                <p className="text-orange-800 font-medium mb-1">Chrome</p>
                <p>上の「📰 Freederに追加」ボタンをブックマークバーにドラッグ&ドロップしてください。ブックマークバーが表示されていない場合は <kbd className="px-1 py-0.5 bg-orange-100 border border-orange-300 rounded text-orange-700">Ctrl+Shift+B</kbd>（Mac: <kbd className="px-1 py-0.5 bg-orange-100 border border-orange-300 rounded text-orange-700">⌘+Shift+B</kbd>）で表示できます。</p>
              </div>
              <div>
                <p className="text-orange-800 font-medium mb-1">Firefox</p>
                <p>上の「📰 Freederに追加」ボタンをブックマークツールバーにドラッグ&ドロップしてください。ツールバーが表示されていない場合は、メニューバーの「表示」→「ツールバー」→「ブックマークツールバー」を選択して表示させてください。</p>
              </div>
              <div>
                <p className="text-orange-800 font-medium mb-1">Safari</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>まず任意のページをブックマークに追加します（<kbd className="px-1 py-0.5 bg-orange-100 border border-orange-300 rounded text-orange-700">⌘+D</kbd>）</li>
                  <li>ブックマークを編集し、名前を「Freederに追加」などに変更</li>
                  <li>URLの欄に以下のコードを貼り付けて保存します</li>
                </ol>
                <div className="mt-1">
                  <input
                    type="text"
                    readOnly
                    value={bookmarkletHref}
                    className="w-full px-2 py-1 bg-white border border-orange-300 rounded text-xs text-gray-600 font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <p className="text-orange-400 mt-1">クリックして全選択 → コピーしてください</p>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
