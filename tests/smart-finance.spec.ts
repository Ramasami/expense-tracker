import { test, expect, type Page } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";
async function setup(page: Page) {
  const mock = await mockGoogle(page);
  const source = mock.f.grids["Expense Ledger"][1];
  source[1] = "Green Garden Cafe";
  source[17] = "2";
  const second = [...source];
  second[10] = "synthetic-second";
  second[1] = "UPI Green Garden Cafe 456";
  mock.f.grids["Expense Ledger"].push(second);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  return mock;
}
async function navigate(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
}
for (const width of [320, 390, 768, 1440])
  test(`forecast, duplicates and learned tags fit ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const { state } = await setup(page);
    await navigate(page, "Income & Cash Flow");
    const forecast = page.getByRole("region", { name: "Cash-flow forecast" });
    await expect(
      forecast.getByRole("heading", { name: "Cash-flow forecast" }),
    ).toBeVisible();
    await expect(forecast.locator(".forecast-metrics")).toContainText(
      "Projected",
    );
    await forecast.getByRole("button", { name: "Adjust assumptions" }).click();
    const before = state.sheetRequests;
    await forecast
      .getByLabel("Expected monthly income", { exact: true })
      .fill("10000");
    await forecast
      .getByLabel("Expected monthly cash outflow", { exact: true })
      .fill("5000");
    await forecast
      .getByLabel("One-off adjustment", { exact: true })
      .fill("-2000");
    await forecast.getByLabel("Forecast horizon").selectOption("30");
    await expect(forecast.locator(".forecast-metrics")).toContainText("₹2,500");
    expect(state.sheetRequests).toBe(before);
    await forecast
      .getByLabel("Expected monthly income", { exact: true })
      .fill("");
    await expect(forecast.getByRole("alert")).toContainText("valid forecast");
    await forecast.getByRole("button", { name: "Reset to history" }).click();
    await expect(forecast.getByRole("alert")).toHaveCount(0);
    await forecast.getByRole("button", { name: "Hide assumptions" }).click();
    await forecast.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `work/cash-forecast-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await navigate(page, "Transactions");
    const duplicates = page.locator(".duplicate-review");
    await duplicates.locator("summary").click();
    await expect(duplicates.locator(".duplicate-pair")).toHaveCount(1);
    await expect(duplicates).toContainText("Same merchant, date and amount");
    await duplicates.getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toContainText("Edit transaction");
    await page.getByRole("button", { name: "Close form" }).click();
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .click();
    await page
      .getByLabel("Description / merchant", { exact: true })
      .fill("Green Garden Cafe");
    await expect(page.locator(".category-suggestion")).toContainText(
      "Groceries",
    );
    await page.screenshot({ path: `work/category-suggestion-${width}.png` });
    await page
      .getByRole("button", { name: "Use Groceries", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Expense tag", exact: true }),
    ).toHaveValue("Groceries");
    await expect(page.locator(".category-suggestion")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("forecast explicitly marks stale records and stays read only", async ({
  page,
}) => {
  const { state } = await setup(page);
  await navigate(page, "Income & Cash Flow");
  state.failReads = true;
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.locator(".offline-banner")).toBeVisible();
  await expect(page.locator(".cash-forecast")).toContainText(
    "Offline or stale data",
  );
  const before = state.sheetRequests;
  await page.getByRole("button", { name: "Adjust assumptions" }).click();
  await page.getByLabel("Expected monthly income", { exact: true }).fill("999");
  expect(state.sheetRequests).toBe(before);
});
test("manual duplicate warning can cancel without saving and CSV skips fuzzy matches", async ({
  page,
}) => {
  const { f } = await setup(page);
  await navigate(page, "Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const form = page.getByRole("dialog");
  await form
    .getByLabel("Description / merchant", { exact: true })
    .fill("Green Garden Cafe");
  await form
    .getByRole("button", { name: "Use Groceries", exact: true })
    .click();
  await form.getByLabel("Amount (₹)", { exact: true }).fill("250");
  await form.getByLabel("Date", { exact: true }).fill("2026-11-02");
  const before = f.grids["Expense Ledger"].length;
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = true;
    expect(dialog.message()).toContain("already be recorded");
    await dialog.dismiss();
  });
  await form
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  expect(warned).toBe(true);
  expect(f.grids["Expense Ledger"].length).toBe(before);
  await expect(form).toBeVisible();
  await page.getByRole("button", { name: "Close form" }).click();
  await page
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const upload = page.getByRole("dialog");
  await upload.locator('input[type="file"]').setInputFiles({
    name: "synthetic.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Description,Amount\n2026-11-02,UPI Green Garden Cafe 999,250\n",
    ),
  });
  await upload
    .getByLabel("Import into account", { exact: true })
    .selectOption("ram-bank");
  await upload
    .getByRole("button", { name: "Build preview", exact: true })
    .click();
  await expect(upload).toContainText("Possible duplicate");
  await expect(
    upload.getByLabel("Import row 1", { exact: true }),
  ).not.toBeChecked();
  expect(f.grids["Expense Ledger"].length).toBe(before);
});
test("cash forecast and duplicate review support dark theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await setup(page);
  await navigate(page, "Settings");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await navigate(page, "Income & Cash Flow");
  await page.locator(".cash-forecast").scrollIntoViewIfNeeded();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.mouse.move(0, 0);
  await page.screenshot({ path: "work/cash-forecast-dark-390.png" });
});
