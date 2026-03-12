"use client";

import { useEffect, useRef } from "react";
import type { FeedlyEntry } from "@/lib/feedly";

const ZOOM_LEVELS = [0.75, 0.9, 1.0, 1.15, 1.3];

interface Props {
  entry: FeedlyEntry;
  onClose: () => void;
  fontSizeLevel?: number;
}

export default function SitePreview({ entry, onClose, fontSizeLevel = 1 }: Props) {
  const url = entry.alternate?.[0]?.href;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        try {
          const iframeWin = iframeRef.current?.contentWindow;
          if (iframeWin) {
            const dir = e.shiftKey ? -1 : 1;
            iframeWin.scrollBy({
              top: iframeWin.innerHeight * 0.9 * dir,
              behavior: "smooth",
            });
          }
        } catch {
          // cross-origin iframe - can't scroll
        }
        return;
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Also handle keys when iframe has focus
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    function onLoad() {
      try {
        iframe!.contentDocument?.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === " ") {
            e.preventDefault();
            const dir = e.shiftKey ? -1 : 1;
            iframe!.contentWindow?.scrollBy({
              top: (iframe!.contentWindow?.innerHeight ?? 600) * 0.9 * dir,
              behavior: "smooth",
            });
            return;
          }
          // Forward other shortcuts to parent
          if (["j", "k", "s", "m", "b", "v"].includes(e.key)) {
            e.preventDefault();
            window.dispatchEvent(
              new KeyboardEvent("keydown", { key: e.key, bubbles: true })
            );
          }
        });
      } catch {
        // cross-origin iframe
      }
    }

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [onClose]);

  if (!url) return null;

  const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,.65)" }}
      onClick={onClose}
    >
      <div
        className="w-[92vw] h-[90vh] flex flex-col rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e2e] flex-shrink-0 min-h-[36px]">
          <div className="flex-1 text-xs text-gray-400 truncate">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 hover:underline"
            >
              {url}
            </a>
          </div>
          <span className="text-[10px] text-gray-600 flex-shrink-0">
            Space: スクロール　Shift+Space: 戻る　v / Esc: 閉じる
          </span>
          <button
            onClick={onClose}
            className="flex-shrink-0 bg-transparent border-none text-sm text-gray-500 hover:text-white hover:bg-white/10 cursor-pointer px-2 py-0.5 rounded"
          >
            ✕
          </button>
        </div>
        <iframe
          ref={iframeRef}
          src={proxyUrl}
          className="flex-1 border-none bg-white origin-top-left"
          style={{
            zoom: ZOOM_LEVELS[fontSizeLevel] || 1,
          }}
          sandbox="allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
}
