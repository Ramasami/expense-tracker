"use client";
import { useEffect } from "react";
export default function OfflineShell() {
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;
    const url = new URL("./sw.js", window.location.href);
    navigator.serviceWorker
      .register(url.pathname, { scope: new URL("./", url).pathname })
      .catch(() => {
        // Offline startup still works through an already installed worker.
      });
  }, []);
  return null;
}
