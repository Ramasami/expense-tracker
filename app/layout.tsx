import "./globals.css";
export const metadata = {
  title: "Budget Tracker · A little clarity. A brighter future.",
  description: "Ram and Varsha’s household finances, thoughtfully together.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
