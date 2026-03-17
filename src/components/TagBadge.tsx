"use client";

interface TagBadgeProps {
  name: string;
  color?: string;
  isAi?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

export default function TagBadge({ name, color, isAi, onRemove, onClick }: TagBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isAi
          ? "bg-blue-50 text-blue-600 border border-blue-200"
          : "text-white"
      } ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
      style={!isAi && color ? { backgroundColor: color } : undefined}
      onClick={onClick}
    >
      {isAi && <span className="text-[10px] font-bold opacity-60">AI</span>}
      {name}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:opacity-60 text-current"
        >
          ×
        </button>
      )}
    </span>
  );
}
