"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogoWithText } from "@/components/Logo";

export default function SettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.username) setUsername(data.username);
        else router.push("/login");
      })
      .catch(() => router.push("/login"));
  }, [router]);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("新しいパスワードが一致しません");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        return;
      }

      setMessage("パスワードを変更しました");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
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

        <div className="flex items-center gap-3 mb-6 p-3 bg-gray-700 rounded-lg">
          <span className="w-10 h-10 rounded-full bg-white text-orange-500 font-bold text-lg flex items-center justify-center flex-shrink-0">
            {username.charAt(0).toUpperCase()}
          </span>
          <div>
            <div className="text-white font-medium">{username}</div>
            <div className="text-gray-400 text-xs">ユーザー設定</div>
          </div>
        </div>

        <h2 className="text-white text-sm font-semibold mb-3">パスワード変更</h2>

        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              現在のパスワード
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-orange-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              新しいパスワード
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-orange-500"
              required
              minLength={4}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              新しいパスワード（確認）
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:border-orange-500"
              required
              minLength={4}
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {message && <p className="text-green-400 text-sm">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-md font-medium transition-colors"
          >
            {loading ? "..." : "パスワードを変更"}
          </button>
        </form>

        <button
          onClick={() => router.push("/")}
          className="w-full mt-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-md text-sm transition-colors"
        >
          戻る
        </button>
      </div>
    </div>
  );
}
