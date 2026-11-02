"use client";
import { useEffect, useState } from "react";
export function useScrollToolbar(page: string, pinned: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY,
      frame = 0;
    setHidden(false);
    const scroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY,
          delta = y - last;
        if (y < 30 || pinned || delta < 0) setHidden(false);
        else if (delta > 1 && y > 85) setHidden(true);
        last = y;
      });
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(frame);
    };
  }, [page, pinned]);
  return { hidden, reveal: () => setHidden(false) };
}
