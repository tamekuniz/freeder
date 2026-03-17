"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoWithText } from "@/components/Logo";

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [hasEnvToken, setHasEnvToken] = useState(false);

  // Pick up OAuth error/code from URL params
  const oauthError = searchParams.get("error");
  const oauthCode = searchParams.get("code");
  const oauthState = searchParams.get("state");
  const [oauthLoading, setOauthLoading] = useState(false);

  // Handle OAuth2 callback: Feedly redirects back to http://localhost:3000 with code & state
  useEffect(() => {
    if (!oauthCode || !oauthState) return;
    setOauthLoading(true);
    setError("");

    // Clean the code/state from the URL to prevent re-processing on refresh
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("code");
    cleanUrl.searchParams.delete("state");
    window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);

    fetch("/api/auth/feedly/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: oauthCode, state: oauthState }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Feedly認証に失敗しました");
          return;
        }
        router.push("/");
      })
      .catch(() => {
        setError("Feedly認証中に通信エラーが発生しました");
      })
      .finally(() => {
        setOauthLoading(false);
      });
  }, [oauthCode, oauthState, router]);

  useEffect(() => {
    fetch("/api/auth/token")
      .then((r) => r.json())
      .then((data) => {
        if (data.hasToken) setHasToken(true);
        if (data.hasEnvToken) setHasEnvToken(true);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "トークンの検証に失敗しました");
        return;
      }

      router.push("/");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleUseEnvToken() {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useEnv: true }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "トークンの設定に失敗しました");
        return;
      }

      router.push("/");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex justify-center mb-4">
          <LogoWithText size={36} />
        </div>
        <h2 className="text-base font-medium text-gray-300 text-center mb-4">
          Feedly トークンの設定
        </h2>

        {oauthLoading && (
          <div className="bg-orange-500/20 border border-orange-500/50 rounded-md p-3 mb-4">
            <p className="text-orange-400 text-sm">
              Feedly認証中...しばらくお待ちください
            </p>
          </div>
        )}

        {oauthError && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-md p-3 mb-4">
            <p className="text-red-400 text-sm">
              Feedly認証エラー: {oauthError}
            </p>
          </div>
        )}

        {hasToken && (
          <p className="text-orange-400 text-sm mb-4">
            トークンは設定済みです。新しいトークンで上書きもできます。
          </p>
        )}

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Option 1: サーバー共有トークン（Proなしユーザー向け） */}
        {hasEnvToken && (
          <div className="mb-5">
            <div className="bg-gray-700 rounded-md p-4">
              <p className="text-sm font-medium text-white mb-1">
                Feedly Pro を持っていない場合
              </p>
              <p className="text-xs text-gray-400 mb-3">
                サーバーに設定済みの共有トークンを使ってfreederを利用できます
              </p>
              <button
                onClick={handleUseEnvToken}
                disabled={loading}
                className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors text-sm"
              >
                {loading ? "設定中..." : "共有トークンを使う"}
              </button>
            </div>
          </div>
        )}

        {/* 区切り線 */}
        {hasEnvToken && (
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 border-t border-gray-600" />
            <span className="text-xs text-gray-500">または</span>
            <div className="flex-1 border-t border-gray-600" />
          </div>
        )}

        {/* Option 2: Feedlyでログイン（OAuth2） */}
        <div className="bg-gray-700 rounded-md p-4 mb-5">
          <p className="text-sm font-medium text-white mb-1">
            Feedlyアカウントでログイン
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Feedlyで認証するとトークンが自動更新されるため、再設定が不要になります
          </p>
          <button
            onClick={() => { window.location.href = "/api/auth/feedly"; }}
            disabled={loading || oauthLoading}
            className="w-full py-2.5 bg-[#2bb24c] hover:bg-[#249e42] disabled:opacity-50 text-white rounded-md font-medium transition-colors text-sm"
          >
            {oauthLoading ? "認証中..." : "Feedlyでログイン"}
          </button>
        </div>

        {/* 区切り線 */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 border-t border-gray-600" />
          <span className="text-xs text-gray-500">または</span>
          <div className="flex-1 border-t border-gray-600" />
        </div>

        {/* Option 3: 自分のトークン（Proユーザー向け） */}
        <div className="bg-gray-700 rounded-md p-4 mb-4">
          <p className="text-sm font-medium text-white mb-1">
            Feedly Pro を持っている場合
          </p>
          <p className="text-xs text-gray-400 mb-3">
            自分専用のDeveloper Tokenを使ってfreederを利用できます
          </p>
          <ol className="list-decimal list-inside space-y-1 text-xs text-gray-300 mb-3">
            <li>
              <a
                href="https://feedly.com/v3/auth/dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-400 hover:underline"
              >
                feedly.com/v3/auth/dev
              </a>{" "}
              にアクセス
            </li>
            <li>Feedlyアカウントのメールアドレスを入力</li>
            <li>届いたメールのDeveloper Tokenをコピー</li>
            <li>下のフォームにペーストして保存</li>
          </ol>

          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded-md text-white text-sm font-mono focus:outline-none focus:border-orange-500 resize-none"
              rows={3}
              placeholder="Developer Tokenをペースト..."
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading || !token.trim()}
                className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors text-sm"
              >
                {loading ? "検証中..." : "トークンを保存"}
              </button>
              {hasToken && (
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md transition-colors text-sm"
                >
                  スキップ
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <SetupContent />
    </Suspense>
  );
}
