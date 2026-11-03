"use client";
import { useEffect } from "react";
export default function OfflineShell() {
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    )
      return;
    if (window.location.pathname.endsWith("/hdfc-connect/")) return;
    const url = new URL(
      (process.env.NEXT_PUBLIC_APP_BASE_PATH || "") + "/sw.js",
      window.location.origin,
    );
    navigator.serviceWorker
      .register(url.pathname, { scope: new URL("./", url).pathname })
      .catch(() => {
        // Offline startup still works through an already installed worker.
      });
  }, []);
  return null;
}
