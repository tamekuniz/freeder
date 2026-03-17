"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoWithText } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        return;
      }

      // Check if user has Feedly token
      const meRes = await fetch("/api/auth/me");
      const me = await meRes.json();

      if (me.hasToken) {
        router.push("/");
      } else {
        router.push("/settings");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex justify-center mb-6">
          <LogoWithText size={40} />
        </div>

        <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
          <button
            type="button"
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              !isRegister
                ? "bg-orange-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
            onClick={() => {
              setIsRegister(false);
              setError("");
            }}
          >
            ログイン
          </button>
          <button
            type="button"
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
              isRegister
                ? "bg-orange-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
            onClick={() => {
              setIsRegister(true);
              setError("");
            }}
          >
            新規登録
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              ユーザー名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-orange-500"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-orange-500"
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
          >
            {loading
              ? "..."
              : isRegister
                ? "登録"
                : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
