"use client";

const shortcuts = [
  { key: "/", label: "Search" },
  { key: "f", label: "Folder search" },
  { key: "j", label: "Next" },
  { key: "k", label: "Prev" },
  { key: "h/l", label: "Feed" },
  { key: "H/L", label: "Unread feed" },
  { key: "g/;", label: "Folder" },
  { key: "x", label: "Fold" },
  { key: "b", label: "Open bg" },
  { key: "v", label: "Site" },
  { key: "m", label: "Unread" },
  { key: "s", label: "Star" },
  { key: "Ctrl+r", label: "Sync" },
  { key: "+/-", label: "Font" },
];

export default function KeyboardHint() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-100 border-t text-xs text-gray-500">
      {shortcuts.map(({ key, label }) => (
        <span key={key} className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px] font-mono shadow-sm">
            {key}
          </kbd>
          <span>{label}</span>
        </span>
      ))}
    </div>
  );
}
