import { test, expect } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";
test("Settings includes searchable historical releases and commit details", async ({
  page,
}) => {
  await mockGoogle(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const history = page.locator(".release-history");
  await history.locator(":scope > summary").click();
  await expect(history).toContainText("v1.0.16");
  await expect(history).toContainText(
    "Keep transaction forms within the viewport",
  );
  await history.getByLabel("Search version history").fill("v0.1.0");
  await expect(history).toContainText("v0.1.0");
  await history.getByLabel("Search version history").fill("no-such-update-zz");
  await expect(history).toContainText("No matching updates.");
  await history.getByLabel("Search version history").fill("");
  await history.getByRole("button", { name: "Show older versions" }).click();
  await expect(history.locator(".release-history-item")).toHaveCount(12);
});
