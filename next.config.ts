import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "export",
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ||
      execFileSync("node", ["scripts/release-version.mjs"], {
        encoding: "utf8",
      }).trim(),
  },
  trailingSlash: true,
  basePath: process.env.PAGES_BASE_PATH || "",
  images: { unoptimized: true },
};
export default nextConfig;
