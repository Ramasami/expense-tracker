"use client";
import { useEffect } from "react";
export default function TouchViewport() {
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const gesture = (event: Event) => {
      if (coarse.matches && event.cancelable) event.preventDefault();
    };
    const pinch = (event: TouchEvent) => {
      if (coarse.matches && event.touches.length > 1 && event.cancelable)
        event.preventDefault();
    };
    document.addEventListener("dblclick", gesture, { passive: false });
    document.addEventListener("gesturestart", gesture, { passive: false });
    document.addEventListener("gesturechange", gesture, { passive: false });
    document.addEventListener("touchstart", pinch, { passive: false });
    document.addEventListener("touchmove", pinch, { passive: false });
    return () => {
      document.removeEventListener("dblclick", gesture);
      document.removeEventListener("gesturestart", gesture);
      document.removeEventListener("gesturechange", gesture);
      document.removeEventListener("touchstart", pinch);
      document.removeEventListener("touchmove", pinch);
    };
  }, []);
  return null;
}
