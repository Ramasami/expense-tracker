import { test, expect, type Page } from "@playwright/test";
import { mockGoogle } from "./browser-helpers";
async function setup(page: Page) {
  const mock = await mockGoogle(page);
  const state = {
    configured: false,
    revoked: false,
    unavailable: false,
    denied: false,
    calls: [] as string[],
    shortRestore: false,
    pause: null as Promise<void> | null,
    paused: false,
    until: Date.now() + 30 * 86400000,
  };
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient:c=>({requestAccessToken:()=>{fetch('/test-signin-count');c.callback({access_token:'test-token',expires_in:3600,scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'})}}),initCodeClient:c=>({requestCode:()=>c.callback({code:'synthetic-auth-code'})})}}};`,
    }),
  );
  await page.route(
    "https://script.google.com/macros/s/**/exec",
    async (route) => {
      const req = route.request().postDataJSON();
      if (
        ![
          "sessionStatus",
          "configureSession",
          "createSession",
          "restoreSession",
          "revokeSession",
        ].includes(req.action)
      )
        return route.fallback();
      state.calls.push(req.action);
      if (req.action === "restoreSession" && state.pause) {
        state.paused = true;
        await state.pause;
        state.pause = null;
      }
      if (req.action === "revokeSession") {
        state.revoked = true;
        return route.fulfill({ json: { ok: true, result: { revoked: true } } });
      }
      if (req.action === "restoreSession" && (state.denied || state.revoked))
        return route.fulfill({
          json: {
            ok: false,
            code: "SESSION_EXPIRED",
            error: "Google access or owner permission changed. Sign in again.",
          },
        });
      if (req.action === "restoreSession" && state.unavailable)
        return route.fulfill({
          json: {
            ok: false,
            code: "SESSION_TEMPORARY",
            error: "Temporary outage",
          },
        });
      if (req.action === "configureSession") {
        expect(req.clientSecret).toBe("synthetic-client-secret");
        state.configured = true;
      }
      let result: any = { configured: state.configured, canConfigure: true };
      if (req.action === "createSession" || req.action === "restoreSession") {
        result = {
          email: mock.state.email,
          accessToken: "test-token",
          expiresAt: Date.now() + (state.shortRestore ? 65000 : 3600000),
          rememberedUntil: state.until,
          ...(req.action === "createSession"
            ? { deviceToken: "a".repeat(96) }
            : {}),
        };
        state.shortRestore = false;
      }
      return route.fulfill({ json: { ok: true, result } });
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  return { ...mock, auth: state };
}
async function settings(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Remembered login", exact: true }),
  ).toBeVisible();
}
async function enroll(page: Page) {
  await settings(page);
  await page
    .getByLabel("Google OAuth client secret", { exact: true })
    .fill("synthetic-client-secret");
  await page
    .getByRole("button", { name: "Save login setup", exact: true })
    .click();
  await expect(
    page.getByLabel("Google OAuth client secret", { exact: true }),
  ).toHaveValue("");
  await page
    .getByRole("button", { name: "Remember this device", exact: true })
    .click();
  await expect(page.locator(".session-settings")).toContainText(
    "This device is remembered until",
  );
}
for (const width of [390, 1440])
  test(`remembered device renews expired access after reopen without Google login ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    const { state, auth } = await setup(page);
    await enroll(page);
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("wealthtrack-google-session")!),
    );
    expect(saved.deviceToken).toHaveLength(96);
    expect(saved.refreshToken).toBeUndefined();
    await page.locator(".session-settings").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `work/remembered-login-${width}.png` });
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("wealthtrack-google-session")!);
      s.expiresAt = Date.now() - 1000;
      localStorage.setItem("wealthtrack-google-session", JSON.stringify(s));
    });
    await page.reload();
    await expect(page.locator(".sync")).toContainText("Google connected");
    expect(state.signIns).toBe(1);
    expect(auth.calls).toContain("restoreSession");
    await settings(page);
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Sign in with Google", exact: true }),
    ).toBeVisible();
    await expect.poll(() => auth.revoked).toBe(true);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("wealthtrack-google-session"),
      ),
    ).toBeNull();
  });
test("temporary renewal failure preserves remembered login and shows cached data read-only", async ({
  page,
}) => {
  const { auth } = await setup(page);
  await enroll(page);
  auth.unavailable = true;
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("wealthtrack-google-session")!);
    s.expiresAt = Date.now() - 1000;
    localStorage.setItem("wealthtrack-google-session", JSON.stringify(s));
  });
  await page.reload();
  await expect(page.locator(".offline-banner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add transaction", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("wealthtrack-google-session")!)
          .deviceToken,
    ),
  ).toHaveLength(96);
  auth.unavailable = false;
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator(".sync")).toContainText("Google connected");
});
test("removed permissions end the remembered session and hide financial data", async ({
  page,
}) => {
  const { auth } = await setup(page);
  await enroll(page);
  auth.denied = true;
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("wealthtrack-google-session"),
    ),
  ).toBeNull();
  await expect(page.getByRole("navigation")).toHaveCount(0);
});
test("open app renews access before expiry without closing the screen", async ({
  page,
}) => {
  await page.clock.install();
  const { auth } = await setup(page);
  await enroll(page);
  auth.shortRestore = true;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  const calls = auth.calls.filter((a) => a === "restoreSession").length;
  await page.clock.runFor(6000);
  await expect
    .poll(() => auth.calls.filter((a) => a === "restoreSession").length)
    .toBeGreaterThan(calls);
  await expect(page.locator(".sync")).toContainText("Google connected");
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toHaveCount(0);
});

test("late renewal cannot sign out a newer login", async ({ page }) => {
  await page.clock.install();
  const { auth, state } = await setup(page);
  await enroll(page);
  auth.shortRestore = true;
  await page.reload();
  await expect(page.locator(".sync")).toContainText("Google connected");
  await settings(page);
  let release!: () => void;
  auth.pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.clock.runFor(6000);
  await expect.poll(() => auth.paused).toBe(true);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .click();
  await expect(page.locator(".sync")).toContainText("Google connected");
  release();
  await expect.poll(() => auth.pause).toBeNull();
  await expect(
    page.getByRole("button", { name: "Sign in with Google", exact: true }),
  ).toHaveCount(0);
  expect(state.signIns).toBe(2);
});
