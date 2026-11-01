import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "python3 scripts/preview.py --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
  reporter: "list",
});
