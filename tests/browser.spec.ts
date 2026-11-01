import { test, expect } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";

test("first screen requires login and never requests financial data anonymously", async ({
  page,
}) => {
  const { state } = await mockGoogle(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("nav")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Add transaction", exact: true }),
  ).toHaveCount(0);
  expect(state.sheetRequests).toBe(0);
  expect(state.publicRequests).toBe(0);
  expect(await page.title()).toContain("Budget Tracker");
});
test("an unapproved Google account cannot request the workbook", async ({
  page,
}) => {
  const { state } = await mockGoogle(page);
  state.email = "outsider@example.com";
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".auth-screen [role=alert]")).toContainText(
    "not authorized",
  );
  await expect(page.locator("nav")).toHaveCount(0);
  expect(state.sheetRequests).toBe(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("wealthtrack-google-session"),
    ),
  ).toBeNull();
});
test("expired stored login requires sign-in before any sheet fetch", async ({
  page,
}) => {
  const { state } = await mockGoogle(page);
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "wealthtrack-google-session",
      JSON.stringify({ accessToken: "expired", expiresAt: Date.now() - 1000 }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toBeEnabled();
  expect(state.sheetRequests).toBe(0);
  await expect(page.locator("nav")).toHaveCount(0);
});
