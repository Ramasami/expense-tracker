import "./globals.css";
import OfflineShell from "./offline-shell";
import TouchViewport from "./touch-viewport";
import type { Viewport } from "next";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
export const metadata = {
  title: "Budget Tracker · A little clarity. A brighter future.",
  description: "Your household finances, thoughtfully together.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OfflineShell />
        <TouchViewport />
        {children}
      </body>
    </html>
  );
}
