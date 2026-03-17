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
    } catch {}
  }

  // OPML import
  async function handleOPMLImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const res = await fetch("/api/rss/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opml: text }),
      });
      const data = await res.json();
      setImportResult(`${data.imported}件インポート、${data.skipped}件スキップ`);
      // Reload feeds
      const feeds = await fetch("/api/rss/feeds").then(r => r.json());
      setRssFeeds(feeds);
    } catch {
      setImportResult("インポートに失敗しました");
    }
  }

  // Build bookmarklet href (needs window.location.origin)
  const bookmarkletOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const bookmarkletHref = `javascript:void(fetch('${bookmarkletOrigin}/api/rss/feeds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:location.href}),credentials:'include'}).then(r=>r.json()).then(d=>alert(d.error?'Error: '+d.error:'Added: '+(d.title||d.feed_url))).catch(()=>alert('Failed to add feed')))`;

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex justify-center mb-4">
          <LogoWithText size={36} />
        </div>
        <h2 className="text-base font-medium text-gray-300 text-center mb-4">
          Freeder 設定
        </h2>

        {/* Go to main page button */}
        {rssFeeds.length > 0 && (
          <button
            onClick={() => router.push("/")}
            className="w-full py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md text-sm mb-4"
          >
            &larr; メインページへ
          </button>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* === RSSフィード管理 === */}
        <div className="bg-gray-700 rounded-md p-4 mb-5">
          <h3 className="text-sm font-medium text-white mb-3">RSSフィード管理</h3>

          {/* フィードURL追加 */}
          <form onSubmit={handleAddFeed} className="flex gap-2 mb-3">
            <input
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml or サイトURL"
              className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white text-sm focus:outline-none focus:border-orange-500"
            />
            <button
              type="submit"
              disabled={addingFeed || !feedUrl.trim()}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md text-sm font-medium"
            >
              {addingFeed ? "追加中..." : "追加"}
            </button>
          </form>

          {/* フィード追加結果メッセージ */}
          {feedMessage && (
            <p className={`text-sm mb-3 ${feedMessageType === "success" ? "text-green-400" : "text-red-400"}`}>
              {feedMessage}
            </p>
          )}

          {/* 登録済みフィード一覧 */}
          {rssFeeds.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {rssFeeds.map((feed) => (
                <div key={feed.id} className="flex items-center justify-between px-2 py-1.5 bg-gray-600 rounded text-sm">
                  <span className="text-gray-200 truncate flex-1">{feed.title || feed.feed_url}</span>
                  <button
                    onClick={() => handleDeleteFeed(feed.id)}
                    className="text-gray-400 hover:text-red-400 ml-2 flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* === OPMLインポート === */}
        <div className="bg-gray-700 rounded-md p-4 mb-5">
          <h3 className="text-sm font-medium text-white mb-1">OPMLインポート</h3>
          <p className="text-xs text-gray-400 mb-3">
            FeedlyやほかのRSSリーダーからエクスポートしたOPMLファイルを読み込みます
          </p>
          <input
            type="file"
            accept=".opml,.xml"
            onChange={handleOPMLImport}
            className="block w-full text-sm text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-orange-500 file:text-white hover:file:bg-orange-600"
          />
          {importResult && (
            <p className="text-sm mt-2 text-green-400">{importResult}</p>
          )}
        </div>

        {/* === ブックマークレット === */}
        <div className="bg-gray-700 rounded-md p-4 mb-5">
          <h3 className="text-sm font-medium text-white mb-1">ブックマークレット</h3>
          <p className="text-xs text-gray-400 mb-3">
            下のボタンをブックマークバーにドラッグ&ドロップすると、ブラウザで見ているサイトをワンクリックでRSS登録できます
          </p>
          <a
            href={bookmarkletHref}
            className="inline-block px-4 py-2 bg-orange-500 text-white rounded-md text-sm font-medium cursor-grab"
            onClick={(e) => { e.preventDefault(); alert("このボタンをブックマークバーにドラッグ&ドロップしてください"); }}
          >
            📰 Freederに追加
          </a>

          <details className="mt-4">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
              ブラウザ別の登録方法を見る
            </summary>
            <div className="mt-2 space-y-3 text-xs text-gray-400">
              <div>
                <p className="text-gray-300 font-medium mb-1">Chrome</p>
                <p>上の「📰 Freederに追加」ボタンをブックマークバーにドラッグ&ドロップしてください。ブックマークバーが表示されていない場合は <kbd className="px-1 py-0.5 bg-gray-600 rounded text-gray-300">Ctrl+Shift+B</kbd>（Mac: <kbd className="px-1 py-0.5 bg-gray-600 rounded text-gray-300">⌘+Shift+B</kbd>）で表示できます。</p>
              </div>
              <div>
                <p className="text-gray-300 font-medium mb-1">Firefox</p>
                <p>上の「📰 Freederに追加」ボタンをブックマークツールバーにドラッグ&ドロップしてください。ツールバーが表示されていない場合は、メニューバーの「表示」→「ツールバー」→「ブックマークツールバー」を選択して表示させてください。</p>
              </div>
              <div>
                <p className="text-gray-300 font-medium mb-1">Safari</p>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                  <li>まず任意のページをブックマークに追加します（<kbd className="px-1 py-0.5 bg-gray-600 rounded text-gray-300">⌘+D</kbd>）</li>
                  <li>ブックマークを編集し、名前を「Freederに追加」などに変更</li>
                  <li>URLの欄に以下のコードを貼り付けて保存します</li>
                </ol>
                <div className="mt-1">
                  <input
                    type="text"
                    readOnly
                    value={bookmarkletHref}
                    className="w-full px-2 py-1 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 font-mono"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <p className="text-gray-500 mt-1">クリックして全選択 → コピーしてください</p>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
