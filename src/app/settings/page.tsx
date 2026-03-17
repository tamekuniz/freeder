"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoWithText } from "@/components/Logo";

export default function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  // RSS feed add state
  const [feedUrl, setFeedUrl] = useState("");
  const [feedCategory, setFeedCategory] = useState("");
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedMessage, setFeedMessage] = useState("");
  const [feedMessageType, setFeedMessageType] = useState<"success" | "error">("success");

  // OPML import state
  const [rssFeeds, setRssFeeds] = useState<Array<{id: string, feed_url: string, category?: string}>>([]);
  const [importResult, setImportResult] = useState("");
  const [opmlPreview, setOpmlPreview] = useState<Array<{title: string, feedUrl: string, category: string}>>([]);
  const [opmlSelected, setOpmlSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [opmlText, setOpmlText] = useState("");

  // AI settings state
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [ollamaEnabled, setOllamaEnabled] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState("");
  const [claudeEnabled, setClaudeEnabled] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiEnabled, setGeminiEnabled] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  // Load user info, feeds, and preferences in parallel
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then(r => r.json()),
      fetch("/api/rss/feeds").then(r => r.json()).catch(() => []),
      fetch("/api/preferences").then(r => r.json()).catch(() => ({})),
    ]).then(([me, feeds, prefs]) => {
      if (!me.username) { router.push("/login"); return; }
      setUsername(me.username);

      setRssFeeds(feeds);
      const cats = new Set<string>();
      for (const f of feeds) { if (f.category) cats.add(f.category); }
      setExistingCategories(Array.from(cats).sort());

      if (prefs["ollama-url"]) setOllamaUrl(prefs["ollama-url"]);
      if (prefs["claude-api-key"]) setClaudeApiKey(prefs["claude-api-key"]);
      if (prefs["chatgpt-api-key"]) setOpenaiApiKey(prefs["chatgpt-api-key"]);
      if (prefs["gemini-api-key"]) setGeminiApiKey(prefs["gemini-api-key"]);
      setOllamaEnabled(prefs["ollama-enabled"] === "true");
      setClaudeEnabled(prefs["claude-enabled"] === "true");
      setOpenaiEnabled(prefs["chatgpt-enabled"] === "true");
      setGeminiEnabled(prefs["gemini-enabled"] === "true");
    }).catch(() => router.push("/login"));
  }, [router]);

  // Password change
  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwMessage("");
    if (newPassword !== confirmPassword) {
      setPwError("新しいパスワードが一致しません");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setPwError(data.error || "エラーが発生しました"); return; }
      setPwMessage("パスワードを変更しました");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch { setPwError("通信エラーが発生しました"); }
    finally { setPwLoading(false); }
  }

  // Add RSS feed
  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setAddingFeed(true);
    setFeedMessage("");
    try {
      const body: Record<string, string> = { url: feedUrl.trim() };
      if (feedCategory.trim()) body.category = feedCategory.trim();
      const res = await fetch("/api/rss/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "追加に失敗しました");
      setFeedMessage(`「${data.title || data.feed_url}」を追加しました`);
      setFeedMessageType("success");
      setFeedUrl("");
      const feeds = await fetch("/api/rss/feeds").then(r => r.json());
      setRssFeeds(feeds);
      const cats = new Set<string>();
      for (const f of feeds) { if (f.category) cats.add(f.category); }
      setExistingCategories(Array.from(cats).sort());
    } catch (err) {
      setFeedMessage(err instanceof Error ? err.message : "追加に失敗しました");
      setFeedMessageType("error");
    } finally { setAddingFeed(false); }
  }

  // OPML preview
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
      const allItems: Array<{title: string, feedUrl: string, category: string}> = data.items || [];
      const existingUrls = new Set(rssFeeds.map(f => f.feed_url));
      const newItems = allItems.filter(item => !existingUrls.has(item.feedUrl));
      setOpmlPreview(newItems);
      setOpmlSelected(new Set(newItems.map((_, i) => i)));
      setImportResult(
        newItems.length < allItems.length
          ? `${allItems.length}件中${allItems.length - newItems.length}件は登録済みのためスキップ`
          : ""
      );
    } catch { setImportResult("OPMLの読み込みに失敗しました"); }
    e.target.value = "";
  }

  // OPML import
  async function handleOPMLImport() {
    if (opmlSelected.size === 0) return;
    setImporting(true);
    try {
      const selectedFeedUrls = opmlPreview.filter((_, i) => opmlSelected.has(i)).map(item => item.feedUrl);
      const res = await fetch("/api/rss/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opml: opmlText, selectedUrls: selectedFeedUrls }),
      });
      const data = await res.json();
      setImportResult(`${data.imported}件インポート、${data.skipped}件スキップ`);
      setOpmlPreview([]); setOpmlSelected(new Set()); setOpmlText("");
      const feeds = await fetch("/api/rss/feeds").then(r => r.json());
      setRssFeeds(feeds);
    } catch { setImportResult("インポートに失敗しました"); }
    finally { setImporting(false); }
  }

  // Save AI settings (all providers at once)
  async function handleSaveAI() {
    try {
      const settings = [
        { key: "ollama-url", value: ollamaUrl },
        { key: "ollama-enabled", value: String(ollamaEnabled) },
        { key: "claude-api-key", value: claudeApiKey },
        { key: "claude-enabled", value: String(claudeEnabled) },
        { key: "chatgpt-api-key", value: openaiApiKey },
        { key: "chatgpt-enabled", value: String(openaiEnabled) },
        { key: "gemini-api-key", value: geminiApiKey },
        { key: "gemini-enabled", value: String(geminiEnabled) },
      ];
      await Promise.all(
        settings.map(({ key, value }) =>
          fetch("/api/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value }),
          })
        )
      );
      setAiMessage("保存しました");
      setTimeout(() => setAiMessage(""), 2000);
    } catch { setAiMessage("保存に失敗しました"); }
  }

  // Bookmarklet
  const bookmarkletOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const bookmarkletHref = `javascript:void(fetch('${bookmarkletOrigin}/api/rss/feeds',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:location.href}),credentials:'include'}).then(r=>r.json()).then(d=>alert(d.error?'Error: '+d.error:'Added: '+(d.title||d.feed_url))).catch(()=>alert('Failed to add feed')))`;

  const sectionClass = "bg-gray-50 border border-gray-200 rounded-lg p-5 mb-5";
  const labelClass = "block text-sm text-gray-600 mb-1";
  const inputClass = "w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-800 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-orange-500 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <LogoWithText size={28} variant="white" />
          <span className="text-white/70 text-sm">/</span>
          <h1 className="text-white font-medium">設定</h1>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-md text-sm transition-colors"
        >
          戻る &rarr;
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* User profile */}
        <div className="flex items-center gap-3 mb-8">
          <span className="w-12 h-12 rounded-full bg-orange-500 text-white font-bold text-xl flex items-center justify-center flex-shrink-0">
            {username.charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="text-gray-900 font-medium text-lg">{username}</div>
            <div className="text-gray-400 text-sm">ユーザー設定</div>
          </div>
        </div>

        {/* === RSSフィード追加 === */}
        <div className={sectionClass}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">RSSフィード追加</h3>
          <form onSubmit={handleAddFeed} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                placeholder="https://example.com/feed.xml or サイトURL"
                className={`flex-1 ${inputClass}`}
              />
              <button
                type="submit"
                disabled={addingFeed || !feedUrl.trim()}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors flex-shrink-0"
              >
                {addingFeed ? "..." : "追加"}
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-500 flex-shrink-0">フォルダ:</label>
              <select
                value={feedCategory}
                onChange={(e) => setFeedCategory(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-800 text-sm focus:outline-none focus:border-orange-500"
              >
                <option value="">未分類</option>
                {existingCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <input
                type="text"
                value={feedCategory}
                onChange={(e) => setFeedCategory(e.target.value)}
                placeholder="新しいフォルダ名"
                className={`flex-1 ${inputClass}`}
              />
            </div>
          </form>
          {feedMessage && (
            <p className={`text-sm mt-2 ${feedMessageType === "success" ? "text-green-600" : "text-red-500"}`}>
              {feedMessage}
            </p>
          )}
        </div>

        {/* === OPMLインポート === */}
        <div className={sectionClass}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">OPMLインポート</h3>
          <p className="text-xs text-gray-500 mb-3">
            FeedlyやほかのRSSリーダーからエクスポートしたOPMLファイルを読み込みます
          </p>
          <input
            type="file"
            accept=".opml,.xml"
            onChange={handleOPMLPreview}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-orange-500 file:text-white hover:file:bg-orange-600 file:transition-colors"
          />
          {opmlPreview.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={opmlSelected.size === opmlPreview.length}
                    onChange={() => {
                      if (opmlSelected.size === opmlPreview.length) setOpmlSelected(new Set());
                      else setOpmlSelected(new Set(opmlPreview.map((_, i) => i)));
                    }}
                    className="accent-orange-500"
                  />
                  全選択 ({opmlPreview.length}件)
                </label>
                <span className="text-xs text-gray-500">{opmlSelected.size}件選択中</span>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {opmlPreview.map((item, i) => (
                  <label key={i} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-200 rounded text-sm cursor-pointer hover:bg-orange-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={opmlSelected.has(i)}
                      onChange={() => {
                        setOpmlSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i); else next.add(i);
                          return next;
                        });
                      }}
                      className="accent-orange-500 flex-shrink-0"
                    />
                    <span className="text-gray-700 truncate flex-1">{item.title || item.feedUrl}</span>
                    {item.category && <span className="text-xs text-orange-400 flex-shrink-0">{item.category}</span>}
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
          {importResult && <p className="text-sm mt-2 text-green-600">{importResult}</p>}
        </div>

        {/* === ブックマークレット === */}
        <div className={sectionClass}>
          <h3 className="text-sm font-semibold text-gray-800 mb-1">ブックマークレット</h3>
          <p className="text-xs text-gray-500 mb-3">
            下のボタンをブックマークバーにドラッグ&ドロップすると、ブラウザで見ているサイトをワンクリックでRSS登録できます
          </p>
          <a
            href={bookmarkletHref}
            className="inline-block px-4 py-2 bg-orange-500 text-white rounded-md text-sm font-medium cursor-grab hover:bg-orange-600 transition-colors"
            onClick={(e) => { e.preventDefault(); alert("このボタンをブックマークバーにドラッグ&ドロップしてください"); }}
          >
            Freederに追加
          </a>
        </div>

        {/* === AI設定 === */}
        <div className={sectionClass}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">AI設定</h3>
          <p className="text-xs text-gray-500 mb-4">
            使用するAIプロバイダーのAPIキーを設定してください。環境変数でも設定可能です。
          </p>
          <div className="space-y-3">
            {/* Ollama */}
            <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-md">
              <input type="checkbox" checked={ollamaEnabled} onChange={(e) => setOllamaEnabled(e.target.checked)} className="accent-orange-500 mt-1" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">Ollama</div>
                <input
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
            {/* Claude */}
            <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-md">
              <input type="checkbox" checked={claudeEnabled} onChange={(e) => setClaudeEnabled(e.target.checked)} className="accent-orange-500 mt-1" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">Claude</div>
                <input
                  type="password"
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
            {/* ChatGPT */}
            <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-md">
              <input type="checkbox" checked={openaiEnabled} onChange={(e) => setOpenaiEnabled(e.target.checked)} className="accent-orange-500 mt-1" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">ChatGPT</div>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
            {/* Gemini */}
            <div className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-md">
              <input type="checkbox" checked={geminiEnabled} onChange={(e) => setGeminiEnabled(e.target.checked)} className="accent-orange-500 mt-1" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-800">Gemini</div>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveAI}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-sm font-medium transition-colors"
              >
                保存
              </button>
              {aiMessage && <span className="text-sm text-green-600">{aiMessage}</span>}
            </div>
          </div>
        </div>

        {/* === パスワード変更 === */}
        <div className={sectionClass}>
          <h3 className="text-sm font-semibold text-gray-800 mb-3">パスワード変更</h3>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <div>
              <label className={labelClass}>現在のパスワード</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>新しいパスワード</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} required minLength={4} />
            </div>
            <div>
              <label className={labelClass}>新しいパスワード（確認）</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} required minLength={4} />
            </div>
            {pwError && <p className="text-red-500 text-sm">{pwError}</p>}
            {pwMessage && <p className="text-green-600 text-sm">{pwMessage}</p>}
            <button type="submit" disabled={pwLoading} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md text-sm font-medium transition-colors">
              {pwLoading ? "..." : "パスワードを変更"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
