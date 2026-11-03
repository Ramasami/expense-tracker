import { test, expect, type Page } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";
const report = {
  title: "Your money, with a clearer plan",
  summary:
    "Groceries are the largest recorded spending category. Review flexible costs before choosing an investment amount.",
  sections: ["spending", "saving", "investing", "debt"].map((area) => ({
    area,
    headline: (
      {
        spending: "See where your money goes",
        saving: "Build room for your goals",
        investing: "Invest with a time horizon",
        debt: "Keep repayments in view",
      } as any
    )[area],
    body: "Use the recorded totals as a starting point and check the missing details before deciding.",
    actions: [
      {
        title: "Review your next step",
        why: "Start with the records you can verify.",
        priority: "medium",
        steps: ["Check the original records.", "Choose a realistic target."],
      },
    ],
  })),
  questions: ["What is your emergency reserve target?"],
  caveats: ["This synthetic report covers only the supplied records."],
};
async function setup(page: Page) {
  const { state } = await mockGoogle(page);
  const requests: any[] = [];
  let fail = false;
  await page.route(
    "https://script.google.com/macros/s/**/exec",
    async (route) => {
      const req = route.request().postDataJSON();
      if (req.action === "scannerStatus")
        return route.fulfill({
          json: {
            ok: true,
            result: {
              configured: true,
              provider: "gemini",
              model: "synthetic-model",
            },
          },
        });
      if (req.action === "analyzeFinances") {
        requests.push(req);
        return route.fulfill({
          json: fail
            ? {
                ok: false,
                error: "AI temporarily unavailable. Try again later.",
              }
            : {
                ok: true,
                result: {
                  report,
                  generatedAt: "2026-11-03T10:00:00Z",
                  model: "synthetic-model",
                },
              },
        });
      }
      throw Error("Unexpected service action " + req.action);
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .getByRole("button", { name: "Analyze my finances", exact: true })
    .click();
  return {
    state,
    requests,
    setFail() {
      fail = true;
    },
  };
}
test("financial review requires fresh Sheet data and consent; interactive results never write finances", async ({
  page,
}) => {
  const { state, requests } = await setup(page);
  const d = page.getByRole("dialog");
  await expect(d.getByLabel("Analysis owner")).toHaveValue("Ram");
  await d.getByLabel("Analysis owner").selectOption("Combined");
  const before = state.sheetRequests;
  await d.getByRole("button", { name: "Review my data" }).click();
  await expect(
    d.getByRole("button", { name: "Generate analysis" }),
  ).toBeDisabled();
  expect(state.sheetRequests).toBeGreaterThan(before);
  expect(requests).toHaveLength(0);
  await d
    .getByRole("checkbox", { name: /Send this financial summary/ })
    .check();
  await d.getByRole("button", { name: "Generate analysis" }).click();
  await expect(d.getByRole("heading", { name: report.title })).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].summary.scope.ownerCount).toBe(2);
  expect(JSON.stringify(requests[0].summary)).not.toMatch(
    /Original|@gmail|"receipts"|"description"|access_token/,
  );
  const after = state.sheetRequests;
  await d.getByRole("tab", { name: "Spending", exact: true }).click();
  await expect(d.getByLabel("Spending by category")).toContainText("Groceries");
  await d.getByRole("tab", { name: "Savings", exact: true }).click();
  await d.getByLabel("Spending reduction percent").fill("25");
  await expect(d.locator(".finance-scenario")).toContainText("25%");
  await d.getByText("Review your next step", { exact: true }).click();
  await d.getByRole("checkbox", { name: "Reviewed this idea" }).check();
  expect(requests).toHaveLength(1);
  expect(state.sheetRequests).toBe(after);
  await d.getByText("Change owner, account or period", { exact: true }).click();
  await d.getByLabel("Analysis period").selectOption("All Time");
  await expect(d.getByRole("button", { name: "Review my data" })).toBeVisible();
  await expect(d.getByRole("heading", { name: report.title })).toHaveCount(0);
});
test("financial review fails closed on Sheet and AI errors", async ({
  page,
}) => {
  const { state, requests, setFail } = await setup(page);
  const d = page.getByRole("dialog");
  state.failReads = true;
  await d.getByRole("button", { name: "Review my data" }).click();
  await expect(d.getByRole("alert")).toContainText("Sheets unavailable");
  expect(requests).toHaveLength(0);
  state.failReads = false;
  await d.getByRole("button", { name: "Review my data" }).click();
  await d
    .getByRole("checkbox", { name: /Send this financial summary/ })
    .check();
  setFail();
  await d.getByRole("button", { name: "Generate analysis" }).click();
  await expect(d.getByRole("alert")).toContainText(
    "AI temporarily unavailable",
  );
  await expect(d.getByRole("heading", { name: report.title })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
for (const width of [320, 390, 768, 1440])
  test(`financial review responsive layout ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page);
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Review my data" }).click();
    await d
      .getByRole("checkbox", { name: /Send this financial summary/ })
      .check();
    await d.getByRole("button", { name: "Generate analysis" }).click();
    await expect(d.getByRole("heading", { name: report.title })).toBeVisible();
    await d.getByRole("tab", { name: "Spending", exact: true }).click();
    expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(
      true,
    );
    const overflow = await d.locator("input,select,button").evaluateAll(
      (els) =>
        els.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && (r.left < 0 || r.right > innerWidth + 1);
        }).length,
    );
    expect(overflow).toBe(0);
    await d.evaluate((el) => (el.scrollTop = 0));
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `work/finance-review-${width}.png`,
        fullPage: false,
      });
    if (width === 390) {
      await page.evaluate(
        () => (document.documentElement.dataset.theme = "dark"),
      );
      await expect(
        d.getByRole("button", { name: "Close financial analysis" }),
      ).toHaveCSS("background-color", "rgb(36, 36, 36)");
      await expect(d.locator(".finance-metrics").first()).toHaveCSS(
        "color",
        "rgb(247, 247, 247)",
      );
      await page.screenshot({
        path: "work/finance-review-dark-390.png",
        fullPage: false,
      });
    }
    await page.keyboard.press("Escape");
    await expect(d).toHaveCount(0);
  });
