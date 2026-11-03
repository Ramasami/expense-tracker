"use client";
import { useEffect } from "react";
export default function TouchViewport() {
  useEffect(() => {
    const touch = window.matchMedia("(any-pointer: coarse)");
    const isTouchDevice = () => touch.matches || navigator.maxTouchPoints > 0;
    const gesture = (event: Event) => {
      if (isTouchDevice() && event.cancelable) event.preventDefault();
    };
    const pinch = (event: TouchEvent) => {
      if (isTouchDevice() && event.touches.length > 1 && event.cancelable)
        event.preventDefault();
    };
    const options = { passive: false, capture: true };
    document.addEventListener("dblclick", gesture, options);
    document.addEventListener("gesturestart", gesture, options);
    document.addEventListener("gesturechange", gesture, options);
    document.addEventListener("gestureend", gesture, options);
    document.addEventListener("touchstart", pinch, options);
    document.addEventListener("touchmove", pinch, options);
    return () => {
      document.removeEventListener("dblclick", gesture, true);
      document.removeEventListener("gesturestart", gesture, true);
      document.removeEventListener("gesturechange", gesture, true);
      document.removeEventListener("gestureend", gesture, true);
      document.removeEventListener("touchstart", pinch, true);
      document.removeEventListener("touchmove", pinch, true);
    };
  }, []);
  return null;
}
