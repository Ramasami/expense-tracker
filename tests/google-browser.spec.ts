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
    .getByRole("button", { name: "Accounts", exact: true })
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
    page.getByRole("button", { name: "Add account", exact: true }),
  ).toBeDisabled();
  state.failWrites = false;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts", exact: true })
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
    .getByRole("button", { name: "Accounts", exact: true })
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
    page.locator(".stat.card").filter({ hasText: "Paid expenses" }),
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
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
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

test("Accounts config supports multiple credit cards and credit purchases use its card dropdown", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  const account = page.locator(".entity-card").filter({
    has: page.getByRole("heading", { name: "Ram HDFC", exact: true }),
  });
  await account.getByRole("button", { name: "Edit", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Add credit card", exact: true })
    .click();
  await dialog
    .getByLabel("Credit card 1 name", { exact: true })
    .fill("HDFC Visa");
  await dialog
    .getByRole("button", { name: "Add credit card", exact: true })
    .click();
  await dialog
    .getByLabel("Credit card 2 name", { exact: true })
    .fill("HDFC RuPay");
  await dialog.getByText("Billing cycle", { exact: true }).first().click();
  await dialog
    .getByLabel("Credit card 1 statement day", { exact: true })
    .fill("20");
  await dialog
    .getByLabel("Credit card 1 payment due day", { exact: true })
    .fill("5");
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const saved = JSON.parse(f.grids.Accounts[1][7]);
  expect(saved.creditCards.map((card: any) => card.name)).toEqual([
    "HDFC Visa",
    "HDFC RuPay",
  ]);
  expect(saved.creditCards[0].statementDay).toBe(20);
  expect(saved.creditCards[0].dueDay).toBe(5);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (₹)", { exact: true }).fill("123+77");
  await dialog.getByLabel("Description / merchant").fill("Delayed purchase");
  await dialog
    .getByRole("combobox", { name: "Expense tag", exact: true })
    .click();
  await dialog.getByRole("option", { name: "Groceries", exact: true }).click();
  await dialog
    .getByLabel("Expense timing", { exact: true })
    .selectOption("Credit");
  await expect(
    dialog.getByLabel("Credit card", { exact: true }).locator("option"),
  ).toContainText(["Select…", "HDFC Visa", "HDFC RuPay"]);
  await dialog
    .getByLabel("Credit card", { exact: true })
    .selectOption(saved.creditCards[1].id);
  await dialog
    .getByRole("button", { name: "Save transaction", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const details = JSON.parse(f.grids["Expense Ledger"].at(-1)![23]);
  expect(details.expenseMode).toBe("Credit");
  expect(details.creditCardName).toBe("HDFC RuPay");
  await page
    .locator("nav")
    .getByRole("button", { name: "Credit Card Bills", exact: true })
    .click();
  await expect(page.locator(".credit-charge-list")).toContainText(
    "Delayed purchase",
  );
  await expect(page.locator(".credit-charge-list")).toContainText("HDFC RuPay");
});

test("credit bills select all unpaid charges, settle a subset cross-account, survive retries and reopen on deletion", async ({
  page,
}) => {
  const { f, state } = await mockGoogle(page);
  const account = JSON.parse(f.grids.Accounts[1][7]);
  account.creditCards = [
    { id: "visa", name: "Visa" },
    { id: "amex", name: "Amex" },
  ];
  f.grids.Accounts[1][7] = JSON.stringify(account);
  for (const [id, name, amount, card] of [
    ["c1", "First charge", 100, "visa"],
    ["c2", "Second charge", 200, "visa"],
    ["c3", "Third charge", 300, "amex"],
  ] as const) {
    const row = [...f.grids["Expense Ledger"][1]];
    row[1] = name;
    row[4] = amount;
    row[10] = id;
    row[23] = JSON.stringify({
      expenseMode: "Credit",
      creditCardId: card,
      creditCardName: card,
    });
    f.grids["Expense Ledger"].push(row);
  }
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Credit Card Bills", exact: true })
    .click();
  await expect(page.locator(".credit-charge")).toHaveCount(3);
  await expect(
    page.getByLabel("Select all listed transactions", { exact: true }),
  ).toBeChecked();
  await expect(page.locator(".credit-summary")).toContainText("₹600");
  await page
    .getByLabel("Credit card filter", { exact: true })
    .selectOption("visa");
  await expect(page.locator(".credit-charge")).toHaveCount(2);
  await expect(page.locator(".credit-summary")).toContainText("₹300");
  await page.getByLabel("Credit card filter", { exact: true }).selectOption("");
  await page.getByRole("button", { name: /Pay selected/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("From account", { exact: true })
    .selectOption("varsha-bank");
  await dialog
    .locator(".credit-charge")
    .filter({ hasText: "Second charge" })
    .getByRole("checkbox")
    .uncheck();
  await expect(dialog.locator(".credit-summary")).toContainText(
    "Selected · 2 transactions",
  );
  await expect(dialog.locator(".credit-summary")).toContainText("₹400");
  state.dropWriteResponse = true;
  await dialog
    .getByRole("button", { name: /Pay ₹400 and mark selected paid/ })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Retry payment", exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: "Retry payment", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const payments = f.grids["Expense Ledger"]
    .slice(1)
    .filter((row) => JSON.parse(row[23] || "{}").creditPayment);
  expect(payments).toHaveLength(1);
  expect(payments[0][18]).toBe("varsha-bank");
  expect(payments[0][19]).toBe("ram-bank");
  expect(JSON.parse(payments[0][23]).paidTransactionIds).toEqual([
    "sheet-tx-c1",
    "sheet-tx-c3",
  ]);
  await expect(page.locator(".credit-charge")).toHaveCount(1);
  await expect(page.locator(".credit-charge")).toContainText("Second charge");
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: "Credit Card Bills", exact: true })
    .click();
  await expect(page.locator(".credit-charge")).toHaveCount(1);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .locator(".segmented")
    .getByRole("button", { name: "All", exact: true })
    .click();
  const payment = page
    .locator(".transaction-item")
    .filter({ hasText: "Credit card bill payment" });
  page.once("dialog", (dialog) => dialog.accept());
  await payment
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  await expect(payment).toHaveCount(0);
  await page
    .locator("nav")
    .getByRole("button", { name: "Credit Card Bills", exact: true })
    .click();
  await expect(page.locator(".credit-charge")).toHaveCount(3);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((element) => element.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "work/credit-bills-mobile.png",
    fullPage: true,
  });
});

test("loan tracker saves opening paid amounts, splits repayments, reduces principal and persists after refresh", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Loan Tracker", exact: true })
    .click();
  await page.getByRole("button", { name: "Add loan", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Loan name", { exact: true }).fill("Home loan");
  await dialog
    .getByLabel("Original principal (₹)", { exact: true })
    .fill("10000");
  await dialog
    .getByLabel("Annual interest rate (%)", { exact: true })
    .fill("8.5");
  await dialog
    .getByLabel("Principal paid before tracking (₹)", { exact: true })
    .fill("2500");
  await dialog
    .getByLabel("Interest paid before tracking (₹)", { exact: true })
    .fill("500");
  await dialog.getByRole("button", { name: "Save loan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const card = page.locator(".loan-card");
  await expect(card).toContainText("₹7,500");
  await expect(card).toContainText("8.5% annual");
  await card.getByRole("button", { name: "Pay loan", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("From account", { exact: true })
    .selectOption("varsha-bank");
  await dialog.getByLabel("Principal paid (₹)", { exact: true }).fill("500");
  await dialog.getByLabel("Interest paid (₹)", { exact: true }).fill("100");
  await expect(dialog.locator(".credit-summary")).toContainText("₹600");
  await dialog
    .getByRole("button", { name: "Save loan payment", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("₹7,000");
  await expect(card).toContainText("₹3,000");
  await expect(card).toContainText("₹600");
  const details = JSON.parse(f.grids["Expense Ledger"].at(-1)![23]);
  expect(details.loanPayment).toBe(true);
  expect(details.principalPaid).toBe(500);
  expect(details.interestPaid).toBe(100);
  expect(f.grids["Expense Ledger"].at(-1)![18]).toBe("varsha-bank");
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await page
    .locator("nav")
    .getByRole("button", { name: "Loan Tracker", exact: true })
    .click();
  await expect(page.locator(".loan-card")).toContainText("₹7,000");
  await page
    .locator(".loan-card")
    .getByRole("button", { name: "Edit loan", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Annual interest rate (%)", { exact: true })
    .fill("8");
  await dialog.getByRole("button", { name: "Save loan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toContainText("8% annual");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((element) => element.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  await page.screenshot({
    path: "work/loan-tracker-mobile.png",
    fullPage: true,
  });
});

test("unknown statement charges can be reviewed and explicitly confirmed unpaid", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  const account = JSON.parse(f.grids.Accounts[1][7]);
  account.creditCards = [
    {
      id: "card",
      name: "Sample card",
      statementSnapshot: {
        reportedBalance: 1234.56,
        reportedOn: "2026-11-02",
        coverageThrough: "2026-10-16",
        partial: true,
      },
    },
  ];
  f.grids.Accounts[1][7] = JSON.stringify(account);
  f.grids["Expense Ledger"][1][23] = JSON.stringify({
    expenseMode: "Credit",
    creditCardId: "card",
    creditCardName: "Sample card",
    settlementStatus: "Unknown",
    statementImport: true,
  });
  await login(page);
  await expect(
    page.getByRole("button", { name: /Credit card charges to review/ }),
  ).toContainText("₹250");
  await expect(
    page
      .locator(".credit-outstanding")
      .filter({ hasText: "Reported card outstanding" }),
  ).toContainText("₹1,234.56");
  await page
    .locator("nav")
    .getByRole("button", { name: "Credit Card Bills", exact: true })
    .click();
  await expect(page.locator(".statement-snapshot")).toContainText("₹1,234.56");
  await expect(page.locator(".statement-snapshot")).toContainText(
    "settlement is unknown",
  );
  await expect(page.locator(".credit-charge")).toHaveCount(1);
  await expect(page.locator(".credit-charge")).toContainText("Confirm unpaid");
  await expect(
    page.getByRole("button", { name: /Pay selected/ }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I confirm the selected statement charges are still unpaid",
    })
    .check();
  await expect(
    page.getByRole("button", { name: /Pay selected/ }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /Pay selected/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Pay credit card bill" }),
  ).toContainText("₹250");
  await page.getByRole("button", { name: /and mark selected paid/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Pay credit card bill" }),
  ).toHaveCount(0);
  await expect(page.locator(".credit-charge")).toHaveCount(0);
});

test("account balances use current Sheet transactions across screens instead of fixed confirmations", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  const bank = JSON.parse(f.grids.Accounts[1][7]);
  bank.openingBalance = 2000;
  bank.balanceConfirmation = {
    amount: 1500,
    asOf: "2026-11-02",
    source: "Owner confirmed",
  };
  f.grids.Accounts[1][7] = JSON.stringify(bank);
  await login(page);
  const balances = page.getByRole("region", {
    name: "Account balances",
    exact: true,
  });
  const ram = balances.getByRole("article", {
    name: "Ram HDFC balance",
    exact: true,
  });
  await expect(ram).toContainText("₹1,750");
  await expect(ram).not.toContainText("Reconciliation needed");
  await expect(
    page.getByRole("button", { name: /Current Balance/ }),
  ).toContainText("₹1,750");
  for (const name of ["Transactions", "Loan Tracker", "Accounts"]) {
    await page
      .locator("nav")
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .click();
    await expect(ram).toContainText("₹1,750");
  }
  await page
    .locator(".segmented")
    .getByRole("button", { name: "Varsha", exact: true })
    .click();
  await expect(ram).toHaveCount(0);
  await expect(
    balances.getByRole("article", { name: "Varsha HDFC balance", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("balances follow Sheet changes after sync and do not deduct historical withholding again", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  const bank = JSON.parse(f.grids.Accounts[1][7]);
  bank.openingBalance = 2000;
  bank.balanceConfirmation = {
    amount: 1500,
    asOf: "2026-11-02",
    withheldAmount: 250,
    source: "Owner confirmed",
  };
  f.grids.Accounts[1][7] = JSON.stringify(bank);
  await login(page);
  const card = page.getByRole("article", {
    name: "Ram HDFC balance",
    exact: true,
  });
  await expect(card).toContainText("₹1,750");
  await expect(card).not.toContainText("Loan amount withheld");
  // A later expense changes the live balance; the historical bank confirmation stays unchanged.
  f.grids["Expense Ledger"][1][4] = 350;
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(card).toContainText("₹1,650");
  await expect(
    page.getByRole("button", { name: /Current Balance/ }),
  ).toContainText("₹1,650");
  f.grids["Expense Ledger"][1][11] = "Deleted";
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(card).toContainText("₹2,000");
  await expect(
    page.getByRole("button", { name: /Current Balance/ }),
  ).toContainText("₹2,000");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("billing cycles and partial payments retain unpaid remainders after refresh", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  const bank = JSON.parse(f.grids.Accounts[1][7]);
  bank.openingBalance = 1000;
  bank.creditCards = [
    { id: "visa", name: "Visa", statementDay: 20, dueDay: 5 },
  ];
  f.grids.Accounts[1][7] = JSON.stringify(bank);
  f.grids["Expense Ledger"][1][23] = JSON.stringify({
    expenseMode: "Credit",
    creditCardId: "visa",
    creditCardName: "Visa",
  });
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Credit Card Bills", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Unbilled ₹250/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Pay selected/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("From account", { exact: true })
    .selectOption("ram-bank");
  await dialog.getByLabel("Credit payment amount", { exact: true }).fill("100");
  await dialog.getByRole("button", { name: /Record partial payment/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".credit-charge")).toContainText("₹150");
  await expect(page.locator(".credit-charge")).toContainText("Part paid");
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.locator(".credit-charge")).toContainText("₹150");
  const payment = f.grids["Expense Ledger"].find((row) =>
    String(row[1]).includes("Credit card bill payment"),
  );
  expect(JSON.parse(payment![23]).creditAllocations).toEqual({
    "sheet-tx-2": 100,
  });
  await page
    .getByLabel("Credit card filter", { exact: true })
    .selectOption("visa");
  await page
    .locator(".segmented")
    .getByRole("button", { name: "Varsha", exact: true })
    .click();
  await expect(
    page.getByLabel("Credit card filter", { exact: true }),
  ).toHaveValue("");
  await page
    .locator(".segmented")
    .getByRole("button", { name: "Ram", exact: true })
    .click();
  await expect(page.locator(".credit-charge")).toContainText("₹150");
  await page
    .locator(".segmented")
    .getByRole("button", { name: "All", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "work/enhancements-card-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("bank reconciliation saves comparisons without changing the account or transactions", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  const bank = JSON.parse(f.grids.Accounts[1][7]);
  bank.openingBalance = 1000;
  f.grids.Accounts[1][7] = JSON.stringify(bank);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  const panel = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Reconcile bank statement" }),
  });
  await panel.locator("summary").first().click();
  await page.getByLabel("Statement date", { exact: true }).fill("2026-11-02");
  await page
    .getByLabel("Statement closing balance", { exact: true })
    .fill("750");
  await expect(panel).toContainText("Matched");
  await panel
    .getByRole("button", { name: "Save reconciliation", exact: true })
    .click();
  await expect(panel.getByRole("status")).toContainText(
    "saved to Google Sheets",
  );
  expect(
    f.grids["App Settings"].some((r) =>
      String(r[7]).includes('"kind":"reconciliation"'),
    ),
  ).toBe(true);
  expect(JSON.parse(f.grids.Accounts[1][7]).openingBalance).toBe(1000);
  expect(f.grids["Expense Ledger"].filter((r) => r[4] === 250)).toHaveLength(1);
  await page
    .getByLabel("Statement closing balance", { exact: true })
    .fill("700");
  await expect(panel).toContainText("-₹50");
});

test("CSV import previews duplicates and imports selected corrected rows only once", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import statement",
    exact: true,
  });
  await dialog.getByLabel("Statement CSV", { exact: true }).setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'Date,Description,Amount\n01/11/2026,Original,250\n02/11/2026,"New, purchase",123.45',
    ),
  });
  await dialog
    .getByRole("button", { name: "Build preview", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Import row 1", { exact: true }),
  ).not.toBeChecked();
  await expect(
    dialog.getByLabel("Import row 2", { exact: true }),
  ).toBeChecked();
  await dialog.getByLabel("Row 2 amount", { exact: true }).fill("120");
  await dialog
    .getByRole("button", {
      name: "Import 1 selected transactions",
      exact: true,
    })
    .click();
  await expect(dialog).toContainText("1 saved");
  await expect(
    dialog.getByLabel("Import row 2", { exact: true }),
  ).toBeDisabled();
  expect(
    f.grids["Expense Ledger"].filter((r) => r[1] === "New, purchase"),
  ).toHaveLength(1);
  expect(
    f.grids["Expense Ledger"].find((r) => r[1] === "New, purchase")?.[4],
  ).toBe(120);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/enhancements-import-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("monthly budgets persist, reset each month, and restore from the recovery panel", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Budgets", exact: true })
    .click();
  await page.getByRole("button", { name: "Add budget", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Add budget", exact: true });
  await dialog.getByLabel("Budget name", { exact: true }).fill("Food limit");
  await dialog.getByLabel("Monthly limit (₹)", { exact: true }).fill("1000");
  await dialog
    .getByRole("checkbox", { name: "Repeat every month", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Save budget", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".monthly-budgets .entity-card")).toContainText(
    "₹250",
  );
  await page.getByLabel("Budget month", { exact: true }).fill("2026-12");
  await expect(page.locator(".monthly-budgets .entity-card")).toContainText(
    "₹1,000 left",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete budget", exact: true })
    .click();
  await expect(page.locator(".monthly-budgets .entity-card")).toHaveCount(0);
  await page
    .locator("nav")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const recovery = page.locator("details").filter({
    has: page.locator("summary", { hasText: "Recently deleted & archived" }),
  });
  await recovery.locator("summary").first().click();
  await page
    .getByLabel("Recovery category", { exact: true })
    .selectOption("budgets");
  await expect(recovery).toContainText("Food limit");
  await recovery.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(recovery.getByRole("status")).toContainText("Restored");
  await page
    .locator("nav")
    .getByRole("button", { name: "Budgets", exact: true })
    .click();
  await expect(page.locator(".monthly-budgets .entity-card")).toContainText(
    "Food limit",
  );
  expect(f.grids.Budgets.filter((r) => r[1] === "Active")).toHaveLength(1);
  await page.screenshot({
    path: "work/enhancements-budgets-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/enhancements-budgets-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("loan forecasts compare extra payments without writing forecast values as real transactions", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  f.grids["App Settings"].push([
    "forecast-loan",
    "Active",
    1,
    "",
    "",
    "",
    "",
    JSON.stringify({
      id: "forecast-loan",
      name: "Forecast loan",
      kind: "loan",
      accountId: "ram-bank",
      principal: 100000,
      interestRate: 8,
      scheduledEmi: 3000,
      status: "Active",
      version: 1,
    }),
  ]);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Loan Tracker", exact: true })
    .click();
  await page.getByText("Payoff forecast", { exact: true }).click();
  const forecast = page.locator(".loan-card .feature-details");
  await expect(forecast).toContainText("Estimated payoff");
  const before = await forecast.locator(".mini-stats").innerText();
  await forecast
    .getByLabel("Extra per month (₹)", { exact: true })
    .fill("1000");
  await expect(forecast.locator(".mini-stats")).not.toHaveText(before);
  expect(f.grids["Expense Ledger"].length).toBe(2);
  await page.getByRole("button", { name: "Edit loan", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit loan", exact: true });
  await dialog
    .getByLabel("Scheduled monthly payment (₹)", { exact: true })
    .fill("3500");
  await dialog
    .getByLabel("Annual interest rate (%)", { exact: true })
    .fill("9");
  await dialog.getByRole("button", { name: "Save loan", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    forecast.getByLabel("Monthly payment (₹)", { exact: true }),
  ).toHaveValue("3500");
  await expect(
    forecast.getByLabel("Forecast annual rate (%)", { exact: true }),
  ).toHaveValue("9");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "work/enhancements-loan-mobile.png",
    animations: "disabled",
    fullPage: true,
  });
});

test("an unconfirmed CSV import can sync and retry the same row without duplication", async ({
  page,
}) => {
  const { f, state } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import statement",
    exact: true,
  });
  await dialog.getByLabel("Statement CSV", { exact: true }).setInputFiles({
    name: "retry.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Date,Description,Amount\n02/11/2026,Retry import,25"),
  });
  await dialog
    .getByRole("button", { name: "Build preview", exact: true })
    .click();
  state.dropWriteResponse = true;
  await dialog
    .getByRole("button", {
      name: "Import 1 selected transactions",
      exact: true,
    })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Import paused");
  await expect(
    dialog.getByLabel("Row 1 amount", { exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Sync with Google Sheets", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "Import 1 selected transactions",
      exact: true,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", {
      name: "Import 1 selected transactions",
      exact: true,
    })
    .click();
  await expect(dialog).toContainText("1 saved");
  expect(
    f.grids["Expense Ledger"].filter((r) => r[1] === "Retry import"),
  ).toHaveLength(1);
});

test("long CSV previews paginate without losing selection and import explicit transfers", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import statement",
    exact: true,
  });
  const csv =
    "Date,Description,Amount\n" +
    Array.from(
      { length: 26 },
      (_, i) => `02/11/2026,Transfer preview ${i + 1},500`,
    ).join("\n");
  await dialog.getByLabel("Statement CSV", { exact: true }).setInputFiles({
    name: "long.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await dialog
    .getByRole("button", { name: "Build preview", exact: true })
    .click();
  await expect(dialog.locator(".import-row")).toHaveCount(25);
  await dialog
    .getByRole("checkbox", {
      name: "Select valid, non-duplicate rows",
      exact: true,
    })
    .uncheck();
  await dialog.getByLabel("Import row 1", { exact: true }).check();
  await dialog
    .getByLabel("Row 1 type", { exact: true })
    .selectOption("Transfer");
  await dialog
    .getByLabel("Row 1 to account", { exact: true })
    .selectOption("varsha-bank");
  await dialog
    .getByRole("button", { name: "Next preview rows", exact: true })
    .click();
  await expect(dialog.locator(".import-row")).toHaveCount(1);
  await expect(
    dialog.getByLabel("Import row 26", { exact: true }),
  ).not.toBeChecked();
  await dialog
    .getByRole("button", {
      name: "Import 1 selected transactions",
      exact: true,
    })
    .click();
  await expect(dialog).toContainText("1 saved");
  const added = f.grids["Expense Ledger"].filter((r) =>
    String(r[1]).startsWith("Transfer preview"),
  );
  expect(added).toHaveLength(1);
  expect(added[0][18]).toBe("ram-bank");
  expect(added[0][19]).toBe("varsha-bank");
  expect(added[0][21]).toBe("Transfer");
});

test("Back restores the previous screen and transaction filters without duplicating history", async ({
  page,
}) => {
  await mockGoogle(page);
  await login(page);
  await expect(
    page.getByRole("button", { name: "Go back", exact: true }),
  ).toBeDisabled();
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("searchbox", { name: "Search transactions", exact: true })
    .fill("Original");
  await page
    .getByLabel("Sort transactions", { exact: true })
    .selectOption("amount-low");
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to Transactions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search transactions", exact: true }),
  ).toHaveValue("Original");
  await expect(
    page.getByLabel("Sort transactions", { exact: true }),
  ).toHaveValue("amount-low");
  await page
    .getByRole("button", { name: "Back to Dashboard", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: /Hello, Ram/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Go back", exact: true }),
  ).toBeDisabled();
});

test("every screen has an interactive guide that stays read-only and supports keyboard dismissal", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  await login(page);
  const pages = [
    "Dashboard",
    "Transactions",
    "Credit Card Bills",
    "Loan Tracker",
    "Expense Analytics",
    "Investments",
    "Income & Cash Flow",
    "Accounts",
    "Expense Tags",
    "Budgets",
    "Financial Goals",
    "Recurring Transactions",
    "Audit History",
    "Reports",
    "Settings",
  ];
  for (const name of pages) {
    if (name !== "Dashboard")
      await page
        .locator("nav")
        .getByRole("button", { name: new RegExp(`^${name}`) })
        .click();
    await page
      .getByRole("button", { name: `Help for ${name}`, exact: true })
      .click();
    const guide = page.getByRole("dialog", { name, exact: true });
    await expect(guide).toBeVisible();
    await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide).toContainText("STEP 2");
    await page.keyboard.press("Escape");
    await expect(guide).toHaveCount(0);
  }
  expect(f.grids["Expense Ledger"].length).toBe(2);
  await page
    .locator("nav")
    .getByRole("button", { name: "Dashboard", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Help for Dashboard", exact: true })
    .click();
  const guide = page.getByRole("dialog", { name: "Dashboard", exact: true });
  await guide.getByRole("button", { name: /Step 4:/ }).click();
  await guide.getByRole("button", { name: "No", exact: true }).click();
  await expect(guide.getByRole("status")).toContainText("Exactly");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "work/screen-guide-mobile.png",
    animations: "disabled",
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await guide.getByRole("button", { name: "Got it", exact: true }).click();
});

test("toolbar hides when scrolling down and returns after a small upward scroll", async ({
  page,
}) => {
  await mockGoogle(page);
  await login(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect(page.locator(".app-toolbar")).toHaveClass(/toolbar-hidden/);
  await page.evaluate(() => window.scrollTo(0, 590));
  await expect(page.locator(".app-toolbar")).not.toHaveClass(/toolbar-hidden/);
  await expect(
    page.getByRole("button", { name: "Help for Dashboard", exact: true }),
  ).toBeInViewport();
  await page.evaluate(() => window.scrollTo(0, 700));
  await expect(page.locator(".app-toolbar")).toHaveClass(/toolbar-hidden/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator(".app-toolbar")).not.toHaveClass(/toolbar-hidden/);
});

test("a budget can select multiple searched tags and count only those purchases", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  f.grids["Expense Tags"].push([
    "Dining",
    "Expense",
    "",
    "dining",
    "Active",
    1,
  ]);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Budgets", exact: true })
    .click();
  await page.getByRole("button", { name: "Add budget", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add budget", exact: true });
  await dialog.getByLabel("Budget name", { exact: true }).fill("Food together");
  await dialog.getByLabel("Monthly limit (₹)", { exact: true }).fill("1000");
  await dialog.getByRole("button", { name: /Choose tags/ }).click();
  await dialog
    .getByRole("checkbox", { name: "Groceries", exact: true })
    .check();
  await dialog
    .getByRole("textbox", { name: "Search budget tags", exact: true })
    .fill("Din");
  await dialog.getByRole("checkbox", { name: "Dining", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Save budget", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".monthly-budgets .entity-card")).toContainText(
    "Groceries, Dining",
  );
  const record = JSON.parse(f.grids.Budgets.at(-1)![7]);
  expect(record.tagIds).toHaveLength(2);
  await expect(page.locator(".monthly-budgets .entity-card")).toContainText(
    "₹250",
  );
});

test("AI bill scans require review confirmation before any Sheet update", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  let analyses = 0;
  await page.route("https://script.google.com/macros/s/**/exec", (route) => {
    const req = route.request().postDataJSON();
    if (req.action === "scannerStatus")
      return route.fulfill({
        json: { ok: true, result: { configured: true, model: "gpt-4.1-mini" } },
      });
    analyses++;
    return route.fulfill({
      json: {
        ok: true,
        result: {
          transactions: [
            {
              date: "2026-11-02",
              description: "AI bill proposal",
              amount: 125,
              type: "Expense",
              expenseMode: "Debit",
              kind: "purchase",
              tagId: "sheet-tag-2",
              accountHint: null,
              toAccountHint: null,
              creditCardHint: null,
              currency: "INR",
              confidence: "high",
              sourceIndex: 0,
              notes: "Review this receipt",
            },
          ],
          warnings: ["Check the date and amount before saving."],
        },
      },
    });
  });
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import statement",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Scan bills & statements", exact: true })
    .click();
  await dialog.getByLabel("Scan documents", { exact: true }).setInputFiles({
    name: "bill.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-test"),
  });
  await dialog
    .getByRole("button", { name: "Analyze with OpenAI", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Row 1 description", { exact: true }),
  ).toHaveValue("AI bill proposal");
  expect(f.grids["Expense Ledger"].length).toBe(2);
  const save = dialog.getByRole("button", {
    name: "Import 1 selected transactions",
    exact: true,
  });
  await expect(save).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /I reviewed the selected entries/ })
    .check();
  await expect(save).toBeEnabled();
  await dialog.getByLabel("Row 1 amount", { exact: true }).fill("120");
  await expect(save).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /I reviewed the selected entries/ })
    .check();
  await save.click();
  await expect(dialog).toContainText("1 saved");
  expect(
    f.grids["Expense Ledger"].filter((r) => r[1] === "AI bill proposal"),
  ).toHaveLength(1);
  expect(analyses).toBe(1);
});

test("list controls search account names, filter status and sort report choices", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  f.grids.Accounts.push([
    "extra-bank",
    "Active",
    1,
    "",
    "",
    "",
    "",
    JSON.stringify({
      id: "extra-bank",
      name: "AAA savings",
      type: "Bank",
      ownerIds: ["owner-ram"],
      openingBalance: 1000,
      status: "Active",
      version: 1,
    }),
  ]);
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: "Accounts", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search Accounts", exact: true })
    .fill("AAA");
  await expect(
    page.locator(".entity-grid").first().locator(".entity-card"),
  ).toHaveCount(1);
  await expect(
    page.locator(".entity-grid").first().locator(".entity-card"),
  ).toContainText("AAA savings");
  await page
    .getByRole("searchbox", { name: "Search Accounts", exact: true })
    .fill("");
  await page.getByText("Sort & filter", { exact: true }).click();
  await page
    .getByLabel("Sort Accounts", { exact: true })
    .selectOption("amount");
  await expect(
    page.locator(".entity-grid").first().locator(".entity-card").first(),
  ).toContainText("AAA savings");
  await page
    .getByLabel("Accounts status filter", { exact: true })
    .selectOption("Archived");
  await expect(
    page.locator(".entity-grid").first().locator(".entity-card"),
  ).toHaveCount(0);
  await page
    .locator("nav")
    .getByRole("button", { name: "Reports", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search reports", exact: true })
    .fill("Investment");
  await expect(page.locator(".report-card")).toHaveCount(1);
  await expect(page.locator(".report-card")).toContainText(
    "Investment Contribution Report",
  );
});

test("a scanner without an API key shows setup guidance and never analyzes or writes", async ({
  page,
}) => {
  const { f } = await mockGoogle(page);
  let calls = 0;
  await page.route("https://script.google.com/macros/s/**/exec", (route) => {
    calls++;
    expect(route.request().postDataJSON().action).toBe("scannerStatus");
    return route.fulfill({
      json: { ok: true, result: { configured: false, model: "gpt-4.1-mini" } },
    });
  });
  await login(page);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Transactions/ })
    .click();
  await page
    .getByRole("button", { name: "Import statement", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Import statement",
    exact: true,
  });
  await dialog
    .getByRole("button", { name: "Scan bills & statements", exact: true })
    .click();
  await dialog.getByLabel("Scan documents", { exact: true }).setInputFiles({
    name: "bill.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-test"),
  });
  await dialog
    .getByRole("button", { name: "Analyze with OpenAI", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("not configured");
  expect(calls).toBe(1);
  expect(f.grids["Expense Ledger"].length).toBe(2);
});

test("sign-in and privacy guides work without requesting financial records", async ({
  page,
}) => {
  const { state } = await mockGoogle(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Help for Welcome", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Meet Budget Tracker", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(state.sheetRequests).toBe(0);
  await page.goto("/privacy/");
  await page
    .getByRole("button", { name: "Help for Privacy", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Privacy", exact: true }),
  ).toBeVisible();
  expect(state.sheetRequests).toBe(0);
});

test("configured scanner stays ready after reload without asking for the key again", async ({
  page,
}) => {
  await mockGoogle(page);
  let checks = 0;
  await page.route("https://script.google.com/macros/s/**/exec", (route) => {
    expect(route.request().postDataJSON().action).toBe("scannerStatus");
    checks++;
    return route.fulfill({
      json: { ok: true, result: { configured: true, model: "gpt-4.1-mini" } },
    });
  });
  await login(page);
  for (let visit = 0; visit < 2; visit++) {
    await page
      .locator("nav")
      .getByRole("button", { name: /^Transactions/ })
      .click();
    await page
      .getByRole("button", { name: "Import statement", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Import statement",
      exact: true,
    });
    await dialog
      .getByRole("button", { name: "Scan bills & statements", exact: true })
      .click();
    await expect(dialog.getByRole("status")).toContainText(
      "Configured · API key saved securely on the server",
    );
    await expect(
      dialog.getByText("Scanner setup", { exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("link", { name: /Open scanner service setup/ }),
    ).toHaveCount(0);
    if (visit === 0) await page.reload();
  }
  expect(checks).toBe(2);
});
