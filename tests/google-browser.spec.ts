import { test, expect } from "@playwright/test";
import { fixture } from "./sheets-fixture";
test("Google sign-in routes a ledger save to Sheets and confirms the destination", async ({
  page,
}) => {
  const f = fixture();
  await page.route("https://docs.google.com/**", (r) => r.abort());
  await page.route("https://accounts.google.com/gsi/client", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient:function(c){return {requestAccessToken:function(){c.callback({access_token:'test-token',expires_in:3600,scope:'https://www.googleapis.com/auth/spreadsheets'})}}}}}};`,
    }),
  );
  for (const url of [
    "https://www.googleapis.com/oauth2/v3/userinfo",
    "https://sheets.googleapis.com/**",
  ])
    await page.route(url, async (route) => {
      const req = route.request();
      const result = await f.fetcher(req.url(), {
        method: req.method(),
        headers: { Authorization: req.headers()["authorization"] || "" },
        body: req.postData() || undefined,
      });
      await route.fulfill({
        status: result.status,
        contentType: "application/json",
        body: await result.text(),
      });
    });
  await page.goto("/");
  await expect(page.locator(".sync")).toContainText("Sign in to save");
  await page
    .locator("nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page
    .getByLabel("Google Web OAuth client ID", { exact: true })
    .fill("123-test.apps.googleusercontent.com");
  await page
    .locator(".settings")
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".notice")).toContainText(
    "Signed in as ramasami.official@gmail.com",
  );
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts & Ledgers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Google ledger");
  await page.getByLabel("Account type", { exact: true }).selectOption("Custom");
  await page.getByLabel("Opening balance (₹)", { exact: true }).fill("12500");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".notice")).toContainText("Saved to Google Sheets");
  await expect(page.locator(".entity-card")).toContainText("Google ledger");
  expect(JSON.parse(f.grids.Accounts[1][7]).openingBalance).toBe(12500);
  expect(f.grids["Audit Log"][1][11]).toBe("ramasami.official@gmail.com");
});
