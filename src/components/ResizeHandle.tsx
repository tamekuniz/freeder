"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onResize: (deltaX: number) => void;
  className?: string;
}

export default function ResizeHandle({ onResize, className = "" }: Props) {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    lastX.current = e.clientX;
    setDragging(true);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, onResize]);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-orange-400 transition-colors ${
        dragging ? "bg-orange-500" : "bg-transparent"
      } ${className}`}
    />
  );
}
