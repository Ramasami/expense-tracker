import { mockReceiptService } from "./receipt-service-helper";
import { test, expect } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator(".segmented")
    .getByRole("button", { name: "All", exact: true })
    .click();
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
  await expect(page.locator(".transaction-list")).toContainText("₹250");
  f.grids["Expense Ledger"][1][4] = 450;
  const before = state.sheetRequests;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator(".transaction-list")).toContainText("₹450");
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
test("failed reads show a marked read-only cache, including after reload", async ({
  page,
}) => {
  const { state } = await mockGoogle(page);
  await login(page);
  state.failReads = true;
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.locator(".main .alert")).toContainText(
    "Sheets unavailable",
  );
  await expect(page.locator(".offline-banner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.locator(".main .alert")).toContainText(
    /Sheets unavailable|offline/i,
  );
  await expect(page.locator(".offline-banner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeDisabled();
  expect(state.signIns).toBe(1);
  state.failReads = false;
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
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
  expect(JSON.parse(f.grids.Accounts.at(-1)![7]).openingBalance).toBe(12500);
  expect(f.grids["Audit Log"][1][11]).toBe("ramasami.official@gmail.com");
  state.failWrites = true;
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Must not save locally");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator(".main .alert")).toContainText(
    "Sheets unavailable",
  );
  await expect(page.locator(".offline-banner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeDisabled();
  state.failWrites = false;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts & Ledgers", exact: true })
    .click();
  await expect(
    page.locator(".entity-card").filter({ hasText: "Must not save locally" }),
  ).toHaveCount(0);
});
test("transaction accounts use dropdowns; search, account filters and sorting use sheet data", async ({
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
    .getByRole("combobox", { name: "Expense tag", exact: true })
    .click();
  await page.getByRole("option", { name: "Groceries", exact: true }).click();
  await page
    .getByLabel("From account", { exact: true })
    .selectOption("varsha-bank");
  await expect(page.getByLabel("To account", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.grids["Expense Ledger"].at(-1)?.[18]).toBe("varsha-bank");
  expect(f.grids["Expense Ledger"].at(-1)?.[19]).toBe("");
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator(".transaction-item")).toHaveCount(2);
  await page.getByLabel("Sort transactions").selectOption("amount");
  await expect(page.locator(".transaction-item").first()).toContainText(
    "Zebra shop",
  );
  await page.getByLabel("Sort transactions").selectOption("amount-low");
  await expect(page.locator(".transaction-item").first()).toContainText(
    "Original",
  );
  await page
    .getByLabel("Search transactions", { exact: true })
    .fill("Varsha HDFC");
  await expect(page.locator(".transaction-item")).toHaveCount(1);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByLabel("Account filter").selectOption("varsha-bank");
  await page.getByLabel("Minimum amount").fill("501");
  await expect(page.locator(".transaction-item")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.locator(".transaction-item")).toHaveCount(2);
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
  await mockReceiptService(page, {
    onUpload: () => uploads++,
    onDownload: () => downloads++,
  });
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.locator(".merchant").first().click();
  await expect(
    page.getByLabel("Upload bill or receipt", { exact: true }),
  ).toBeEnabled();
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
  await expect(
    page.getByLabel("Upload bill or receipt", { exact: true }),
  ).toBeEnabled();
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
    await expect(nextPage.locator(".transaction-list")).toContainText("₹777");
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
  await mockReceiptService(page, {
    onUpload: (file) => {
      uploadedFiles++;
      if (file.mimeType.startsWith("image/")) {
        imageType = file.mimeType;
        imageName = file.name;
        imageBytes = file.bytes;
      }
    },
    beforeDownload: () => downloadGate,
  });
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.locator(".merchant").first().click();
  await expect(
    page.getByLabel("Upload bill or receipt", { exact: true }),
  ).toBeEnabled();
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
  await mockReceiptService(page, { failName: "failed.pdf" });
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.locator(".merchant").first().click();
  await expect(
    page.getByLabel("Upload bill or receipt", { exact: true }),
  ).toBeEnabled();
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

for (const mode of [
  "owner",
  "reader",
  "drive-failure",
  "sheet-failure",
] as const) {
  test(`receipt deletion handles ${mode} without reporting link-only deletion as success`, async ({
    page,
  }) => {
    const { f, state } = await mockGoogle(page);
    f.grids["Expense Ledger"][1][22] = JSON.stringify([
      {
        id: "receipt-delete",
        name: "bill.pdf",
        mimeType: "application/pdf",
        size: 20,
        uploadedAt: "2026-11-01",
      },
    ]);
    let trashed = false;
    const changes: boolean[] = [];
    await page.route(
      "https://www.googleapis.com/drive/v3/files/receipt-delete**",
      async (route) => {
        if (route.request().method() === "PATCH") {
          const requested = route.request().postDataJSON().trashed;
          changes.push(requested);
          if (mode === "drive-failure")
            return route.fulfill({
              status: 503,
              json: { error: { message: "Drive refused trashing" } },
            });
          trashed = requested;
          return route.fulfill({ json: { id: "receipt-delete", trashed } });
        }
        return route.fulfill({
          json: {
            id: "receipt-delete",
            trashed,
            capabilities: { canTrash: mode !== "reader" },
          },
        });
      },
    );
    await login(page);
    await page
      .locator("nav")
      .getByRole("button", { name: /^Transactions/ })
      .click();
    await page.locator(".merchant").first().click();
    await expect(
      page.getByLabel("Upload bill or receipt", { exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Upload bill or receipt", { exact: true }),
    ).toBeEnabled();
    if (mode === "sheet-failure") state.failWrites = true;
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Delete receipt bill.pdf", exact: true })
      .click();
    if (mode === "owner") {
      await expect(
        page.getByRole("button", { name: "View bill.pdf", exact: true }),
      ).toHaveCount(0);
      await expect(page.locator(".receipts")).toContainText(
        "moved to Google Drive Trash",
      );
      expect(trashed).toBe(true);
      expect(JSON.parse(f.grids["Expense Ledger"][1][22])).toEqual([]);
    } else {
      await expect(page.locator(".receipts [role=alert]")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "View bill.pdf", exact: true }),
      ).toBeVisible();
      expect(JSON.parse(f.grids["Expense Ledger"][1][22])).toHaveLength(1);
      expect(trashed).toBe(false);
      expect(changes).toEqual(
        mode === "reader"
          ? []
          : mode === "sheet-failure"
            ? [true, false]
            : [true],
      );
    }
  });
}

test("pull-to-refresh requests just the visible screen and does not poll Sheets", async ({
  page,
}) => {
  const { f, state } = await mockGoogle(page);
  await login(page);
  expect(state.ranges.at(-1)).toHaveLength(4);
  expect(state.ranges.at(-1)?.join(" ")).not.toContain("Audit Log");
  const before = state.sheetRequests;
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(
    page.getByLabel("Search transactions", { exact: true }),
  ).toBeVisible();
  expect(state.sheetRequests).toBe(before);
  f.grids["Expense Ledger"][1][4] = 888;
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const target = document.querySelector(".greeting")!;
    const touch = (y: number) =>
      new Touch({ identifier: 1, target, clientX: 120, clientY: y });
    target.dispatchEvent(
      new TouchEvent("touchstart", { bubbles: true, touches: [touch(100)] }),
    );
    target.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [touch(280)],
      }),
    );
  });
  await expect(page.locator(".pull-indicator")).toContainText(
    "Release to sync",
  );
  await page.evaluate(() =>
    document
      .querySelector(".greeting")!
      .dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, touches: [] }),
      ),
  );
  await expect(page.locator(".transaction-list")).toContainText("₹888");
  expect(state.sheetRequests - before).toBe(2);
  await page.clock.install();
  const synced = state.sheetRequests;
  await page.clock.fastForward(30000);
  expect(state.sheetRequests).toBe(synced);
});

test("an offline phone relaunch uses the app shell and cached data with edits disabled", async ({
  page,
  context,
}) => {
  const { state } = await mockGoogle(page);
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await page.close();
  await context.setOffline(true);
  const offlinePage = await context.newPage();
  await offlinePage.goto("/");
  await expect(offlinePage.locator(".offline-banner")).toContainText(
    "Offline — cached data",
  );
  await expect(
    offlinePage.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeDisabled();
  await expect(offlinePage.locator("nav")).toBeVisible();
  expect(state.signIns).toBe(1);
  await offlinePage
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(offlinePage.locator(".transaction-list")).toContainText("₹250");
  const next = await mockGoogle(offlinePage);
  next.f.grids["Expense Ledger"][1][4] = 999;
  await context.setOffline(false);
  await expect(offlinePage.locator(".offline-banner")).toHaveCount(0);
  await expect(offlinePage.locator(".transaction-list")).toContainText("₹999");
  await expect(
    offlinePage.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await offlinePage.evaluate(() => {
    const key = "wealthtrack-google-session";
    const saved = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(
      key,
      JSON.stringify({ ...saved, expiresAt: Date.now() - 1 }),
    );
  });
  await offlinePage.reload();
  await expect(
    offlinePage.getByRole("button", {
      name: "Sign in with Google",
      exact: true,
    }),
  ).toBeVisible();
  await expect(offlinePage.locator("nav")).toHaveCount(0);
});

for (const uploader of [
  "ramasami.official@gmail.com",
  "tnvarsha.99@gmail.com",
]) {
  test(`shared receipt uploaded by ${uploader} can be deleted by the other account`, async ({
    page,
  }) => {
    const { f, state } = await mockGoogle(page);
    state.email = uploader;
    const files = await mockReceiptService(page);
    await login(page);
    await page
      .locator("nav")
      .getByRole("button", { name: /^Transactions/ })
      .click();
    await page.locator(".merchant").first().click();
    await expect(
      page.getByLabel("Upload bill or receipt", { exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Upload bill or receipt", { exact: true })
      .setInputFiles({
        name: "shared.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF test"),
      });
    await expect(
      page.getByRole("button", { name: "View shared.pdf", exact: true }),
    ).toBeVisible();
    expect(JSON.parse(f.grids["Expense Ledger"][1][22])[0].storage).toBe(
      "shared-v1",
    );
    state.email =
      uploader === "ramasami.official@gmail.com"
        ? "tnvarsha.99@gmail.com"
        : "ramasami.official@gmail.com";
    await page.reload();
    await expect(page.locator(".sync")).toContainText("Google connected");
    await page
      .locator(".segmented")
      .getByRole("button", { name: "All", exact: true })
      .click();
    await page
      .locator("nav")
      .getByRole("button", { name: /^Transactions/ })
      .click();
    await page.locator(".merchant").first().click();
    await expect(
      page.getByLabel("Delete receipt shared.pdf", { exact: true }),
    ).toBeEnabled();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByLabel("Delete receipt shared.pdf", { exact: true }).click();
    await expect(
      page.getByRole("button", { name: "View shared.pdf", exact: true }),
    ).toHaveCount(0);
    expect(files.get("receipt-1").trashed).toBe(true);
    expect(JSON.parse(f.grids["Expense Ledger"][1][22])).toEqual([]);
  });
}

test("shared receipt deletion restores the owner file when the Sheet save fails", async ({
  page,
}) => {
  const { f, state } = await mockGoogle(page);
  state.email = "tnvarsha.99@gmail.com";
  const files = await mockReceiptService(page);
  const receipt = {
    id: "shared-existing",
    name: "rollback.pdf",
    mimeType: "application/pdf",
    size: 9,
    uploadedAt: "2026-11-01",
    storage: "shared-v1",
  };
  files.set(receipt.id, { ...receipt, trashed: false });
  f.grids["Expense Ledger"][1][22] = JSON.stringify([receipt]);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.locator(".merchant").first().click();
  await expect(
    page.getByLabel("Delete receipt rollback.pdf", { exact: true }),
  ).toBeEnabled();
  state.failWrites = true;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Delete receipt rollback.pdf", { exact: true }).click();
  await expect(page.locator(".receipts [role=alert]")).toContainText(
    "file was restored",
  );
  expect(files.get(receipt.id).trashed).toBe(false);
  expect(JSON.parse(f.grids["Expense Ledger"][1][22])).toHaveLength(1);
});

test("mobile transaction toolbar keeps detailed filters tucked away and tag search restricts dropdown choices", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  f.grids["Expense Tags"].push(["Travel", "Expense", "", "3", "Active", 1]);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel("Search transactions", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Sort transactions")).toBeVisible();
  await expect(page.getByLabel("Account filter")).toHaveCount(0);
  await page.getByRole("button", { name: /^Filters/ }).click();
  const tagFilter = page.getByRole("combobox", {
    name: "Tag filter",
    exact: true,
  });
  await tagFilter.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
    "All categories",
    "Groceries",
    "Travel",
  ]);
  await tagFilter.fill("gRoC");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
    "Groceries",
  ]);
  await page.getByRole("option", { name: "Groceries", exact: true }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("button", { name: /^Filters/ })).toContainText(
    "1",
  );
  await page.locator(".transaction-toolbar").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "work/transactions-mobile-clean.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const tag = dialog.getByRole("combobox", {
    name: "Expense tag",
    exact: true,
  });
  await tag.click();
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveText([
    "Select…",
    "Groceries",
    "Travel",
  ]);
  await tag.fill("travel");
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveText([
    "Travel",
  ]);
  await tag.press("ArrowDown");
  await tag.press("Enter");
  await expect(tag).toHaveValue("Travel");
  await expect(dialog.locator('input[name="tagId"]')).toHaveValue(
    "sheet-tag-3",
  );
  await tag.click();
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveText([
    "Select…",
    "Groceries",
    "Travel",
  ]);
  await tag.fill("no-such-tag");
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText(
    "No matching expense tags",
  );
  await tag.press("Escape");
  await expect(tag).toHaveValue("Travel");
  await expect(dialog.locator('input[name="tagId"]')).toHaveValue(
    "sheet-tag-3",
  );
});

for (const width of [390, 1440]) {
  test(`dialogs lock background scroll and restore the page position at ${width}px`, async ({
    page,
  }) => {
    await mockGoogle(page);
    await page.setViewportSize({ width, height: 450 });
    await login(page);
    await page.evaluate(() => window.scrollTo(0, 180));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);
    // Open without the automation scrolling the page to bring the button into view.
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page.locator("body")).toHaveCSS("position", "fixed");
    await expect(page.locator("body")).toHaveCSS("top", `-${before}px`);
    const position = await page.evaluate(() => window.scrollY);
    await page.mouse.move(2, 100);
    await page.mouse.wheel(0, 600);
    expect(await page.evaluate(() => window.scrollY)).toBe(position);
    await dialog.hover();
    await page.mouse.wheel(0, 500);
    await expect
      .poll(() => dialog.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(position);
    await dialog
      .getByRole("button", { name: "Close form", exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("body")).not.toHaveCSS("position", "fixed");
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
    await page.mouse.move(width / 2, 400);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(before);
  });
}

test("transaction cards fit small screens, wrap details and keep selection and actions", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  const row = [...f.grids["Expense Ledger"][1]];
  row[1] =
    "A long merchant name for groceries, household supplies and everyday essentials";
  row[4] = 12345678;
  row[10] = "3";
  row[18] = "A very long account name for the household expenses";
  f.grids["Expense Ledger"].push(row);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(
    page.getByRole("list", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.locator(".transaction-item")).toHaveCount(2);
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page
        .locator(".transaction-list")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByLabel("Select Original", { exact: true }).check();
  await expect(
    page.getByLabel("Select all visible transactions", { exact: true }),
  ).toHaveJSProperty("indeterminate", true);
  await page
    .getByLabel("Select all visible transactions", { exact: true })
    .check();
  await expect(page.locator(".transaction-checkbox:checked")).toHaveCount(2);
  await page
    .getByLabel("Select all visible transactions", { exact: true })
    .uncheck();
  await expect(page.locator(".transaction-checkbox:checked")).toHaveCount(0);
  await expect(
    page.getByLabel("Edit transaction", { exact: true }),
  ).toHaveCount(2);
  await expect(
    page.getByLabel("Delete transaction", { exact: true }),
  ).toHaveCount(2);
  await page.locator(".transaction-list").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "work/transaction-list-mobile.png",
    fullPage: true,
  });
});

for (const lostResponse of [false, true])
  test(`a ${lostResponse ? "lost committed response" : "failed write"} keeps a usable form and retries the same operation once`, async ({
    page,
  }) => {
    const { f, state } = await mockGoogle(page);
    await login(page);
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Amount (₹)", { exact: true }).fill("123+345+13*2");
    await expect(dialog.locator(".amount-help")).toContainText("494");
    await dialog
      .getByLabel("Description / merchant", { exact: true })
      .fill("Recovery calculation");
    await dialog
      .getByRole("combobox", { name: "Expense tag", exact: true })
      .click();
    await dialog
      .getByRole("option", { name: "Groceries", exact: true })
      .click();
    state.failWrites = !lostResponse;
    state.dropWriteResponse = lostResponse;
    await dialog
      .getByRole("button", { name: "Save transaction", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Close form", exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Retry save", exact: true }),
    ).toBeEnabled();
    await expect(dialog.getByLabel("Amount (₹)", { exact: true })).toHaveValue(
      "123+345+13*2",
    );
    await expect(
      dialog.getByLabel("Amount (₹)", { exact: true }),
    ).toBeDisabled();
    state.failWrites = false;
    // A retry that still cannot sync must remain dismissible and must not write.
    state.failReads = true;
    await dialog
      .getByRole("button", { name: "Retry save", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Retry save", exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeEnabled();
    state.failReads = false;
    let confirmations = 0;
    page.on("dialog", async (message) => {
      confirmations++;
      await message.dismiss();
    });
    await dialog
      .getByRole("button", { name: "Retry save", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(confirmations).toBe(0);
    const rows = f.grids["Expense Ledger"].filter(
      (row) => row[1] === "Recovery calculation",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0][4]).toBe(494);
  });

test("touch devices keep a fixed viewport and block pinch gestures without blocking a single finger", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await mockGoogle(page);
  await login(page);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /maximum-scale=1.*user-scalable=no/,
  );
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await expect(page.getByLabel("Amount (₹)", { exact: true })).toHaveCSS(
    "font-size",
    "16px",
  );
  const gestures = await page.evaluate(() => {
    const pinch = new TouchEvent("touchmove", {
      cancelable: true,
      bubbles: true,
      touches: [
        new Touch({
          identifier: 1,
          target: document.body,
          clientX: 10,
          clientY: 20,
        }),
        new Touch({
          identifier: 2,
          target: document.body,
          clientX: 40,
          clientY: 20,
        }),
      ],
    });
    document.dispatchEvent(pinch);
    const single = new TouchEvent("touchmove", {
      cancelable: true,
      bubbles: true,
      touches: [
        new Touch({
          identifier: 1,
          target: document.body,
          clientX: 10,
          clientY: 20,
        }),
      ],
    });
    document.dispatchEvent(single);
    return { pinch: pinch.defaultPrevented, single: single.defaultPrevented };
  });
  expect(gestures).toEqual({ pinch: true, single: false });
  await context.close();
});

for (const sheetAccess of [true, false])
  test(`a new owner email ${sheetAccess ? "can" : "cannot"} sign in ${sheetAccess ? "with" : "without"} Sheet access`, async ({
    page,
  }) => {
    const { f, state } = await mockGoogle(page);
    state.email = "xyz@example.com";
    state.sheetAccess = sheetAccess;
    f.grids["App Settings"].push([
      "owner-xyz",
      "Active",
      1,
      "",
      "",
      "",
      "",
      JSON.stringify({
        name: "XYZ",
        kind: "owner",
        emails: ["xyz@example.com"],
      }),
    ]);
    await page.goto("/");
    await page
      .getByRole("button", { name: "Sign in with Google", exact: true })
      .click();
    if (sheetAccess) {
      await expect(page.locator(".sync")).toContainText("Google connected");
      await expect(page.locator(".segmented .selected")).toHaveText("XYZ");
    } else {
      await expect(page.locator(".auth-screen [role=alert]")).toContainText(
        "not authorized",
      );
      await expect(page.locator("nav")).toHaveCount(0);
      expect(state.sheetRequests).toBe(0);
    }
  });

test("owner and account management supports creating, renaming, multiple owners and removing account associations", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts & Ledgers", exact: true })
    .click();
  await page.getByRole("button", { name: "Add owner", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("XYZ");
  await dialog
    .getByLabel("Sign-in email addresses", { exact: true })
    .fill("xyz@example.com");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".owner-section")).toContainText("XYZ");
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Joint HDFC");
  await dialog.getByLabel("XYZ", { exact: true }).check();
  await dialog.getByLabel("Opening balance (₹)", { exact: true }).fill("100");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const first = JSON.parse(f.grids.Accounts.at(-1)![7]);
  expect(first.ownerIds).toContain("owner-ram");
  expect(first.ownerIds).toHaveLength(2);
  const card = page.locator(".entity-card").filter({
    has: page.getByRole("heading", { name: "Joint HDFC", exact: true }),
  });
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("XYZ HDFC");
  await dialog.getByLabel("Ram", { exact: true }).uncheck();
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse(f.grids.Accounts.at(-1)![7]).ownerIds).toHaveLength(1);
  await page
    .locator(".segmented")
    .getByRole("button", { name: "XYZ", exact: true })
    .click();
  await expect(
    page.locator(".entity-card").filter({
      has: page.getByRole("heading", { name: "XYZ HDFC", exact: true }),
    }),
  ).toBeVisible();
  page.once("dialog", (message) => message.accept());
  await page
    .locator(".entity-card")
    .filter({
      has: page.getByRole("heading", { name: "XYZ HDFC", exact: true }),
    })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect.poll(() => f.grids.Accounts.at(-1)![1]).toBe("Deleted");
  const owner = page
    .locator(".owner-section .entity-card")
    .filter({ has: page.getByRole("heading", { name: "XYZ", exact: true }) });
  page.once("dialog", (message) => message.accept());
  await owner
    .getByRole("button", { name: "Remove owner", exact: true })
    .click();
  await expect
    .poll(() =>
      f.grids["App Settings"].some(
        (row) =>
          row[1] === "Deleted" && JSON.parse(row[7] || "{}").name === "XYZ",
      ),
    )
    .toBe(true);
});

test("owner-scoped account toggles work on home and transactions; transfer dropdowns enforce source", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await expect(page.getByRole("heading", { name: "Hello, Ram" })).toBeVisible();
  const accounts = page.getByRole("group", { name: "Choose account" });
  await expect(
    accounts.getByRole("button", { name: "Ram HDFC", exact: true }),
  ).toBeVisible();
  await expect(
    accounts.getByRole("button", { name: "Varsha HDFC", exact: true }),
  ).toHaveCount(0);
  await page
    .locator(".segmented")
    .getByRole("button", { name: "All", exact: true })
    .click();
  await accounts
    .getByRole("button", { name: "Varsha HDFC", exact: true })
    .click();
  await expect(
    accounts.getByRole("button", { name: "Varsha HDFC", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".stat.card").filter({ hasText: "Total expenses" }),
  ).toContainText("₹0");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await expect(page.locator(".transaction-item")).toHaveCount(0);
  await accounts.getByRole("button", { name: "Ram HDFC", exact: true }).click();
  await expect(page.locator(".transaction-item")).toHaveCount(1);
  await page
    .locator(".segmented")
    .getByRole("button", { name: "Varsha", exact: true })
    .click();
  await expect(
    accounts.getByRole("button", { name: "Ram HDFC", exact: true }),
  ).toHaveCount(0);
  await expect(
    accounts.getByRole("button", { name: "All accounts", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const source = dialog.getByLabel("From account", { exact: true });
  const destination = dialog.getByLabel("To account", { exact: true });
  await expect(source).toHaveAttribute("required", "");
  await expect(source.locator("option")).toContainText([
    "Select…",
    "Ram HDFC · Ram",
    "Varsha HDFC · Varsha",
  ]);
  await expect(destination).toBeDisabled();
  await dialog.getByLabel("Amount (₹)", { exact: true }).fill("100");
  await dialog.getByLabel("Description / merchant").fill("Account transfer");
  await dialog
    .getByRole("combobox", { name: "Expense tag", exact: true })
    .click();
  await dialog.getByRole("option", { name: "Groceries", exact: true }).click();
  await source.selectOption("");
  await dialog
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  expect(f.grids["Expense Ledger"]).toHaveLength(2);
  await source.selectOption("ram-bank");
  await dialog.getByLabel("Type", { exact: true }).selectOption("Transfer");
  await expect(destination).toBeEnabled();
  await expect(destination).toHaveAttribute("required", "");
  await destination.selectOption("varsha-bank");
  await dialog
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(f.grids["Expense Ledger"].at(-1)?.[18]).toBe("ram-bank");
  expect(f.grids["Expense Ledger"].at(-1)?.[19]).toBe("varsha-bank");
  expect(f.grids["Expense Ledger"].at(-1)?.[6]).toBe("Ram");
  // Selected owner remains Varsha; source belongs to Ram, so transfer is not listed here.
  await expect(page.locator(".transaction-item")).toHaveCount(0);
  await page
    .locator(".segmented")
    .getByRole("button", { name: "Ram", exact: true })
    .click();
  await expect(page.locator(".transaction-item")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/account-switcher-mobile.png",
    fullPage: true,
  });
});
