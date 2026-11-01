import { test, expect } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
}
test("login survives refresh, fetches new sheet values, and sign-out hides data", async ({
  page,
}) => {
  const { f, state } = await mockGoogle(page);
  await login(page);
  await expect(page.getByLabel("Date range", { exact: true })).toHaveValue(
    "All Time",
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator("tbody")).toContainText("₹250");
  f.grids["Expense Ledger"][1][4] = 450;
  const before = state.sheetRequests;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator("tbody")).toContainText("₹450");
  expect(state.signIns).toBe(1);
  expect(state.sheetRequests).toBeGreaterThan(before);
  expect(state.publicRequests).toBe(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("nav")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("wealthtrack-google-session"),
    ),
  ).toBeNull();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toBeEnabled();
});
test("failed reads hide prior data and startup never falls back to browser storage", async ({
  page,
}) => {
  const { state } = await mockGoogle(page);
  await login(page);
  state.failReads = true;
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.locator(".auth-screen [role=alert]")).toContainText(
    "Sheets unavailable",
  );
  await expect(page.locator("nav")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".auth-screen [role=alert]")).toContainText(
    "Sheets unavailable",
  );
  await expect(page.locator("nav")).toHaveCount(0);
  expect(state.signIns).toBe(1);
  state.failReads = false;
  await page.getByRole("button", { name: "Retry Google Sheets" }).click();
  await expect(page.locator(".sync")).toContainText("Google connected");
});
test("confirmed Google saves persist to the sheet and a failed save does not write a local replacement", async ({
  page,
}) => {
  const { f, state } = await mockGoogle(page);
  await login(page);
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
  expect(JSON.parse(f.grids.Accounts[1][7]).openingBalance).toBe(12500);
  expect(f.grids["Audit Log"][1][11]).toBe("ramasami.official@gmail.com");
  state.failWrites = true;
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Must not save locally");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".auth-screen [role=alert]")).toContainText(
    "Sheets unavailable",
  );
  await expect(page.locator("nav")).toHaveCount(0);
  state.failWrites = false;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts & Ledgers", exact: true })
    .click();
  await expect(page.locator(".entity-card")).not.toContainText(
    "Must not save locally",
  );
});
test("transaction accounts accept text; search, combined filters and sorting use sheet data", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await page.getByLabel("Amount (₹)", { exact: true }).fill("500");
  await page.getByLabel("Description / merchant").fill("Zebra shop");
  await page
    .getByLabel("Expense tag", { exact: true })
    .selectOption("sheet-tag-2");
  await page
    .getByLabel("From account", { exact: true })
    .fill("My current account");
  await page.getByLabel("To account", { exact: true }).fill("My wallet");
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.grids["Expense Ledger"].at(-1)?.[18]).toBe("My current account");
  expect(f.grids["Expense Ledger"].at(-1)?.[19]).toBe("My wallet");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByLabel("Sort transactions").selectOption("amount");
  await expect(page.locator("tbody tr").first()).toContainText("Zebra shop");
  await page.getByLabel("Sort transactions").selectOption("amount-low");
  await expect(page.locator("tbody tr").first()).toContainText("Original");
  await page.getByLabel("Search transactions", { exact: true }).fill("wallet");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Account filter").selectOption("My wallet");
  await page.getByLabel("Minimum amount").fill("501");
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
});
test("receipts upload to Drive, link to the sheet, and fetch image bytes only when opened", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  let uploads = 0,
    downloads = 0;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGqkAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route(
    "https://www.googleapis.com/**drive/v3/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("alt") === "media") {
        downloads++;
        return route.fulfill({ contentType: "image/png", body: png });
      }
      if (url.pathname.startsWith("/upload/")) {
        uploads++;
        return route.fulfill({
          json: {
            id: "receipt-1",
            name: "bill.png",
            mimeType: "image/png",
            size: png.length,
          },
        });
      }
      if (url.pathname.endsWith("permissions"))
        return route.fulfill({
          json: {
            permissions: [
              { emailAddress: "tnvarsha.99@gmail.com", role: "reader" },
            ],
          },
        });
      return route.fulfill({ json: { files: [] } });
    },
  );
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.locator(".merchant").first().click();
  await page
    .getByLabel("Upload bill or receipt", { exact: true })
    .setInputFiles({ name: "bill.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByRole("button", { name: "View bill.png", exact: true }),
  ).toBeVisible();
  expect(uploads).toBe(1);
  expect(downloads).toBe(0);
  expect(JSON.parse(f.grids["Expense Ledger"][1][22])[0].id).toBe("receipt-1");
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.locator(".merchant").first().click();
  expect(downloads).toBe(0);
  await page
    .getByRole("button", { name: "View bill.png", exact: true })
    .click();
  await expect(page.getByAltText("bill.png")).toBeVisible();
  expect(downloads).toBe(1);
});
