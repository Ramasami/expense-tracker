import { test, expect } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";
for (const width of [390, 1440])
  test(`grouped navigation and dashboard details ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockGoogle(page);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sign in with Google", exact: true })
      .click();
    await expect(page.locator(".sync")).toContainText("Google connected");
    await expect(page.locator(".overview-heading")).toContainText(
      "All recorded history",
    );
    const detail = page.locator(".dashboard-cash-details");
    await expect(detail).not.toHaveAttribute("open", "");
    await detail.locator("summary").click();
    await expect(detail).toContainText("Ledger cash · All time");
    await expect(detail).not.toContainText("2999");
    await expect(detail.locator(".available-cash")).toBeVisible();
    await detail.locator("summary").click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `work/dashboard-polish-${width}.png` });
    if (width === 390)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("group")).toHaveCount(4);
    await expect(nav.locator('[aria-current="page"]')).toContainText(
      "Dashboard",
    );
    await nav.getByRole("button", { name: /^Transactions/ }).click();
    await expect(nav.locator('[aria-current="page"]')).toContainText(
      "Transactions",
    );
    if (width === 390)
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Your space, your way" }),
    ).toBeVisible();
  });
