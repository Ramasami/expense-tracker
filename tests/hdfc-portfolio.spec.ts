import { test, expect, type Page } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";
const status = {
  configured: true,
  connected: true,
  clientHint: "••••1234",
  connectedAt: "2026-11-03T10:00:00Z",
};
const holdings = [
  {
    name: "Example Industries",
    isin: "SYNTHETIC001",
    exchange: "NSE",
    sector: "Industry",
    quantity: 20,
    averagePrice: 100,
    closePrice: 120,
    investedValue: 2000,
    closingValue: 2400,
    unrealized: 400,
  },
  {
    name: "Sample Technology",
    isin: "SYNTHETIC002",
    exchange: "BSE",
    sector: "Technology",
    quantity: 10,
    averagePrice: 200,
    closePrice: 180,
    investedValue: 2000,
    closingValue: 1800,
    unrealized: -200,
  },
];
async function setup(page: Page, connected = true) {
  const { state } = await mockGoogle(page);
  const calls: any[] = [];
  let fail = false;
  await page.route(
    "https://script.google.com/macros/s/**/exec",
    async (route) => {
      const req = route.request().postDataJSON();
      calls.push(req);
      let result: any;
      switch (req.action) {
        case "hdfcStatus":
          result = { ...status, configured: connected, connected };
          break;
        case "configureHDFC":
          expect(req.apiSecret).toBe("synthetic-api-secret");
          connected = true;
          result = { ...status, connected: false };
          break;
        case "pendingHDFC":
          result = {
            flowId: calls.some((c) => c.action === "beginHDFC")
              ? "synthetic-flow-id-12345"
              : null,
          };
          break;
        case "beginHDFC":
          result = {
            loginUrl:
              "https://developer.hdfcsec.com/oapi/v1/login?api_key=synthetic-api-key",
            flowId: "synthetic-flow-id-12345",
          };
          break;
        case "completeHDFC":
          expect(req.confirmed).toBe(true);
          expect(req.flowId).toBe("synthetic-flow-id-12345");
          expect(req.requestToken).toBe("synthetic-request-token");
          result = status;
          break;
        case "hdfcPortfolio":
          if (fail)
            return route.fulfill({
              json: {
                ok: false,
                error: "HDFC session expired. Connect HDFC again.",
              },
            });
          result = {
            status: { ...status, configured: connected, connected },
            holdings: connected ? holdings : [],
            fetchedAt: connected ? "2026-11-03T10:00:00Z" : null,
          };
          break;
        case "scannerStatus":
          result = { configured: false, model: "synthetic" };
          break;
        default:
          return route.fallback();
      }
      return route.fulfill({ json: { ok: true, result } });
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  return { calls, state, fail: () => (fail = true) };
}
for (const separateContext of [false, true])
  test(`HDFC setup confirms broker login with ${separateContext ? "server flow recovery" : "same-tab flow"}`, async ({
    page,
  }) => {
    if (separateContext)
      await page.addInitScript(() => {
        if (location.pathname.endsWith("/hdfc-connect/")) {
          sessionStorage.removeItem("budget-hdfc-pending-flow");
          localStorage.removeItem("wealthtrack-google-session");
          sessionStorage.removeItem("wealthtrack-google-session");
        }
      });
    const { calls } = await setup(page, false);
    const origin = new URL(page.url()).origin;
    await page
      .locator("nav")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    expect(calls.some((c) => c.action === "hdfcStatus")).toBe(false);
    await page.locator(".hdfc-settings summary").click();
    await expect(
      page.locator(".hdfc-settings button[type=submit]"),
    ).toBeEnabled();
    await expect(page.getByLabel("HDFC callback URL")).toHaveValue(
      origin + "/hdfc-connect/",
    );
    await page.getByLabel("HDFC client ID", { exact: true }).fill("TEST1234");
    await page
      .getByLabel("HDFC API key", { exact: true })
      .fill("synthetic-api-key");
    await page
      .getByLabel("HDFC API secret", { exact: true })
      .fill("synthetic-api-secret");
    await page
      .getByRole("button", { name: "Save credentials", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Connect HDFC", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("HDFC API secret", { exact: true }),
    ).toHaveValue("");
    await page.route(
      "https://developer.hdfcsec.com/oapi/v1/login?api_key=*",
      (route) =>
        route.fulfill({
          contentType: "text/html",
          // WebKit's routing protocol cannot synthesize HTTP redirect responses.
          body: `<script>location.replace(${JSON.stringify(origin + "/hdfc-connect/?request_token=synthetic-request-token")})</script>`,
        }),
    );
    await page
      .getByRole("button", { name: "Connect HDFC", exact: true })
      .click();
    if (separateContext)
      await page
        .getByRole("button", { name: "Sign in with Google", exact: true })
        .click();
    await expect(
      page.getByRole("button", { name: "Connect HDFC for Ram" }),
    ).toBeEnabled();
    await expect(page).toHaveURL(origin + "/hdfc-connect/");
    expect(calls.some((c) => c.action === "completeHDFC")).toBe(false);
    await page.getByRole("button", { name: "Connect HDFC for Ram" }).click();
    await expect(
      page.getByRole("heading", { name: "Portfolio connected" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        JSON.stringify({ ...localStorage, ...sessionStorage }),
      ),
    ).not.toContain("synthetic-api-secret");
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("budget-hdfc-pending-flow"),
      ),
    ).toBeNull();
  });
for (const width of [320, 390, 768, 1440])
  test(`HDFC portfolio viewing and filters fit ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { calls, state, fail } = await setup(page);
    if (width <= 850)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await page
      .locator("nav")
      .getByRole("button", { name: "Investments", exact: true })
      .click();
    const p = page.getByRole("region", { name: "HDFC Securities portfolio" });
    await expect(p).toContainText("₹4,200");
    await expect(p).toContainText("closing prices, not live quotes");
    await expect(p.getByRole("listitem")).toHaveCount(2);
    const sheetCalls = state.sheetRequests;
    await p.getByLabel("Search HDFC holdings").fill("Technology");
    await expect(p.getByRole("listitem")).toHaveCount(1);
    await p.getByLabel("Search HDFC holdings").fill("");
    await p.getByLabel("HDFC holdings sort").selectOption("loss");
    await expect(p.getByRole("listitem").first()).toContainText(
      "Sample Technology",
    );
    await p.getByLabel("HDFC exchange filter").selectOption("NSE");
    await expect(p.getByRole("listitem")).toHaveCount(1);
    expect(calls.filter((c) => c.action === "hdfcPortfolio")).toHaveLength(1);
    expect(state.sheetRequests).toBe(sheetCalls);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await p.getByLabel("HDFC exchange filter").selectOption("");
    if (width === 390 || width === 1440) {
      await p.scrollIntoViewIfNeeded();
      await p.screenshot({
        path: `work/hdfc-portfolio-${width}.png`,
        animations: "disabled",
      });
      if (width === 390) {
        await page.evaluate(
          () => (document.documentElement.dataset.theme = "dark"),
        );
        await expect(p).toHaveCSS("background-color", "rgb(36, 36, 36)");
        await p.screenshot({
          path: "work/hdfc-portfolio-dark-390.png",
          animations: "disabled",
        });
      }
    }
    fail();
    await p.getByRole("button", { name: "Refresh HDFC portfolio" }).click();
    await expect(p.getByRole("alert")).toContainText("stale");
    expect(calls.filter((c) => c.action === "hdfcPortfolio")).toHaveLength(2);
  });
test("HDFC callback rejects unstarted returns and removes sensitive URL parameters", async ({
  page,
}) => {
  await setup(page, false);
  await page.goto("/hdfc-connect/?request_token=synthetic-invalid");
  await expect(page.locator(".hdfc-callback [role=alert]")).toContainText(
    "No matching HDFC connection",
  );
  expect(page.url()).not.toContain("request_token");
  await expect(
    page.getByRole("button", { name: /Connect HDFC for/ }),
  ).toHaveCount(0);
});

for (const width of [390, 768])
  test(`HDFC credential setup fits ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setup(page, false);
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .locator("nav")
      .getByRole("button", { name: "Settings", exact: true })
      .click();
    const form = page.locator(".hdfc-settings");
    await form.locator("summary").click();
    await expect(
      form.getByRole("button", { name: "Save credentials", exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const field of await form.locator("input").all()) {
      const box = await field.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    }
    await form.screenshot({
      path: `work/hdfc-settings-${width}.png`,
      animations: "disabled",
    });
  });
