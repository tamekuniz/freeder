"use client";

import { useState } from "react";

const shortcuts = [
  { key: "j / k", label: "次 / 前の記事" },
  { key: "h / l", label: "次 / 前のフィード" },
  { key: "g / ;", label: "次 / 前のフォルダ" },
  { key: "x", label: "フォルダを開閉" },
  { key: "/", label: "検索" },
  { key: "f", label: "フォルダ内検索" },
  { key: "b", label: "ブラウザで開く" },
  { key: "v", label: "サイトプレビュー" },
  { key: "m", label: "既読/未読切替" },
  { key: "u", label: "未読フィルタ切替" },
  { key: "A", label: "全記事を既読" },
  { key: "s", label: "スター切替" },
  { key: "Ctrl+R", label: "Feedlyと同期" },
  { key: "a", label: "AI パネル" },
  { key: "+ / -", label: "フォントサイズ" },
];

export default function KeyboardHint() {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <div
        className="flex items-center px-4 py-1.5 bg-gray-100 border-t text-xs text-gray-400 cursor-default"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <span>⌨ ショートカット</span>
      </div>

      {show && (
        <div
          className="absolute bottom-full right-0 mb-0 bg-orange-500 text-white rounded-lg shadow-xl p-3 min-w-[240px] z-50"
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => setShow(false)}
        >
          <div className="text-xs font-semibold text-white mb-2">キーボードショートカット</div>
          <div className="space-y-1">
            {shortcuts.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between text-xs gap-4">
                <span className="text-white">{label}</span>
                <kbd className="px-1.5 py-0.5 bg-orange-600 border border-white/30 rounded text-[10px] font-mono text-white whitespace-nowrap">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
