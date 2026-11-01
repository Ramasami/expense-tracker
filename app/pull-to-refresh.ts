"use client";
import { useEffect, useRef, useState } from "react";
export function usePullToRefresh(
  refresh: () => Promise<void>,
  enabled: boolean,
) {
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const callback = useRef(refresh);
  callback.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    let running = false;
    const reset = () => {
      start = null;
      pulled = 0;
      setDistance(0);
    };
    const begin = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        running ||
        (document.scrollingElement?.scrollTop || window.scrollY) > 0
      )
        return;
      const target = event.target as Element;
      if (target.closest("input, select, textarea, .modal-overlay")) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - start.y;
      const dx = Math.abs(event.touches[0].clientX - start.x);
      if (dy <= 0 || dx > dy) {
        reset();
        return;
      }
      if (event.cancelable) event.preventDefault();
      pulled = Math.min(100, dy * 0.5);
      setDistance(pulled);
    };
    const end = async () => {
      const shouldRefresh = pulled >= 65;
      reset();
      if (!shouldRefresh || running) return;
      running = true;
      setRefreshing(true);
      try {
        await callback.current();
      } finally {
        running = false;
        setRefreshing(false);
      }
    };
    document.addEventListener("touchstart", begin, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", reset);
    return () => {
      document.removeEventListener("touchstart", begin);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", reset);
    };
  }, [enabled]);
  return { distance, refreshing };
}
