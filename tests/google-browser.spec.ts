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
      localStorage.getItem("wealthtrack-google-session"),
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

test("a fresh app session restores login after closing the app and fetches fresh financial records", async ({
  page,
  browser,
  context,
}) => {
  await mockGoogle(page);
  await login(page);
  const storageState = await context.storageState();
  expect(
    storageState.origins.some((origin) =>
      origin.localStorage.some(
        (item) => item.name === "wealthtrack-google-session",
      ),
    ),
  ).toBe(true);
  await page.close();
  const reopened = await browser.newContext({
    storageState,
    baseURL: "http://127.0.0.1:4173",
  });
  try {
    const nextPage = await reopened.newPage();
    const { f, state } = await mockGoogle(nextPage);
    f.grids["Expense Ledger"][1][4] = 777;
    await nextPage.goto("/");
    await expect(nextPage.locator(".sync")).toContainText("Google connected");
    expect(state.signIns).toBe(0);
    await nextPage
      .locator("nav")
      .getByRole("button", { name: /^Transactions/ })
      .click();
    await expect(nextPage.locator("tbody")).toContainText("₹777");
    expect(
      await nextPage.evaluate(() =>
        sessionStorage.getItem("wealthtrack-google-session"),
      ),
    ).toBeNull();
  } finally {
    await reopened.close();
  }
});

test("multiple receipts compress photos and show upload and lazy download progress", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  let uploadedFiles = 0;
  let sheetWrites = 0;
  let imageType = "";
  let imageName = "";
  let originalSize = 0;
  let imageBytes: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  let releaseDownload: () => void = () => {};
  const downloadGate = new Promise<void>((resolve) => {
    releaseDownload = resolve;
  });
  page.on("request", (req) => {
    if (req.url().includes("sheets.googleapis.com") && req.method() !== "GET")
      sheetWrites++;
  });
  await page.route(
    "https://www.googleapis.com/**drive/v3/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("alt") === "media") {
        await downloadGate;
        return route.fulfill({ contentType: "image/webp", body: imageBytes });
      }
      if (url.pathname.startsWith("/upload/")) {
        uploadedFiles++;
        const body = route.request().postDataBuffer()!;
        const jsonStart = body.indexOf(Buffer.from("\r\n\r\n")) + 4;
        const jsonEnd = body.indexOf(Buffer.from("\r\n--"), jsonStart);
        const metadata = JSON.parse(
          body.subarray(jsonStart, jsonEnd).toString(),
        );
        const dataStart = body.indexOf(Buffer.from("\r\n\r\n"), jsonEnd) + 4;
        const dataEnd = body.lastIndexOf(Buffer.from("\r\n--"));
        const bytes = body.subarray(dataStart, dataEnd);
        if (metadata.mimeType.startsWith("image/")) {
          imageType = metadata.mimeType;
          imageName = metadata.name;
          imageBytes = bytes;
        }
        return route.fulfill({
          json: {
            id: "file-" + uploadedFiles,
            name: metadata.name,
            mimeType: metadata.mimeType,
            size: bytes.length,
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
  const writesBefore = sheetWrites;
  originalSize = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2200;
    canvas.height = 1200;
    const ctx = canvas.getContext("2d")!;
    const pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 123456;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = seed & 255;
      pixels.data[i + 1] = (seed >>> 8) & 255;
      pixels.data[i + 2] = (seed >>> 16) & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), "image/png"),
    );
    const files = new DataTransfer();
    files.items.add(new File([blob], "large-photo.png", { type: "image/png" }));
    files.items.add(
      new File(["%PDF-1.4 test receipt"], "bill.pdf", {
        type: "application/pdf",
      }),
    );
    const input = document.querySelector<HTMLInputElement>(
      ".receipt-upload input",
    )!;
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return blob.size;
  });
  await expect(
    page.getByRole("button", { name: "View large-photo.webp", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "View bill.pdf", exact: true }),
  ).toBeVisible();
  expect(uploadedFiles).toBe(2);
  expect(imageType).toBe("image/webp");
  expect(imageName).toBe("large-photo.webp");
  expect(imageBytes.length).toBeLessThan(originalSize);
  expect(sheetWrites - writesBefore).toBe(1);
  expect(JSON.parse(f.grids["Expense Ledger"][1][22])).toHaveLength(2);
  await expect(
    page.getByRole("progressbar", {
      name: "Upload progress for large-photo.png",
      exact: true,
    }),
  ).toHaveAttribute("value", "100");
  await page
    .getByRole("button", { name: "View large-photo.webp", exact: true })
    .click();
  await expect(
    page.getByRole("progressbar", {
      name: "Download progress for large-photo.webp",
      exact: true,
    }),
  ).toBeVisible();
  releaseDownload();
  await expect(page.getByAltText("large-photo.webp")).toBeVisible();
  const dimensions = await page
    .getByAltText("large-photo.webp")
    .evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
    }));
  expect(Math.max(dimensions.width, dimensions.height)).toBe(2048);
});

test("a partial receipt batch saves successful files and reports the failed file", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await page.route(
    "https://www.googleapis.com/**drive/v3/**",
    async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/upload/")) {
        const body = route.request().postDataBuffer()!.toString();
        if (body.includes('"name":"failed.pdf"'))
          return route.fulfill({
            status: 503,
            json: { error: { message: "Upload temporarily unavailable" } },
          });
        return route.fulfill({
          json: {
            id: "good-file",
            name: "good.pdf",
            mimeType: "application/pdf",
            size: 9,
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
    .setInputFiles([
      {
        name: "good.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF good"),
      },
      {
        name: "failed.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF failed"),
      },
    ]);
  await expect(
    page.getByRole("button", { name: "View good.pdf", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".receipts [role=alert]")).toContainText(
    "1 saved; 1 failed",
  );
  await expect(page.locator(".receipts [role=alert]")).toContainText(
    "failed.pdf",
  );
  const receipts = JSON.parse(f.grids["Expense Ledger"][1][22]);
  expect(receipts).toHaveLength(1);
  expect(receipts[0].name).toBe("good.pdf");
});
