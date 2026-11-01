import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.beforeEach(async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: 'window.google={accounts:{oauth2:{initTokenClient:function(){throw new Error("Unexpected sign-in in a browser-storage test")}}}};',
    }),
  );
});
test("transaction lifecycle confirms persistence and exports valid files", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("wealthtrack-save-destination", "browser"),
  );
  const apiRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiRequests.push(r.url());
  });
  await page.route("https://docs.google.com/**", async (route) => {
    expect(route.request().method()).toBe("GET");
    const text = route.request().url().includes("gid=132")
      ? '"Available Tags","Type (Auto lookup)"\n"Groceries","Expense"'
      : '"Date","Description / Merchant","Tag","Type","Amount (₹)","Payment Method","Person / Account","Notes","Month (Auto)"';
    await route.fulfill({ contentType: "text/csv", body: text });
  });
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await expect(page.locator(".sync")).toContainText("Saved locally");
  await expect(page.locator(".source-status")).toContainText(
    "Public sheet connected",
  );
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("1250");
  await page.getByLabel("Description / merchant").fill("Browser test merchant");
  await page
    .getByLabel("Expense tag", { exact: true })
    .selectOption("sheet-tag-2");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator("tbody")).toContainText("₹1,250");
  await page.getByLabel("Edit transaction", { exact: true }).click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("1500");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("tbody")).toContainText("₹1,500");
  await page.getByLabel("Delete transaction", { exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Recently deleted", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Restore transaction", { exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Active transactions", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".sync")).toContainText("Saved locally");
  await expect(page.locator(".source-status")).toContainText(
    "Public sheet connected",
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator("tbody")).toContainText("₹1,500");
  expect(apiRequests).toEqual([]);
  await page
    .locator("nav")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  for (const format of ["CSV", "XLSX", "PDF"]) {
    const downloadEvent = page.waitForEvent("download");
    await page
      .locator(".report-card")
      .first()
      .getByRole("button", { name: format })
      .click();
    const file = await downloadEvent;
    const path = await file.path();
    const bytes = fs.readFileSync(path!);
    if (format === "XLSX") expect(bytes.subarray(0, 2).toString()).toBe("PK");
    else if (format === "PDF")
      expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    else expect(bytes.toString()).toContain("expense");
  }
});

test("local transactions work when the public sheet is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("wealthtrack-save-destination", "browser"),
  );
  await page.route("https://docs.google.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator(".sync")).toContainText("Saved locally");
  await expect(page.locator(".source-status")).toContainText(
    "Public sheet unavailable",
  );
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("300");
  await page.getByLabel("Description / merchant").fill("Offline expense");
  await page
    .getByLabel("Expense tag", { exact: true })
    .selectOption("default-tag-0");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Saved locally");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator("tbody")).toContainText("Offline expense");
});

test("Google save never silently falls back to browser storage while signed out", async ({
  page,
}) => {
  await page.route("https://docs.google.com/**", (r) => r.abort());
  await page.goto("/");
  await expect(page.locator(".sync")).toContainText("Sign in to save");
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts & Ledgers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Must not save locally");
  await page.getByLabel("Account type", { exact: true }).selectOption("Custom");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("Sign in to Google");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Sign in to save");
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts & Ledgers", exact: true })
    .click();
  await expect(page.locator(".entity-card")).toHaveCount(0);
});
