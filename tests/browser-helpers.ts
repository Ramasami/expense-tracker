import { Page } from "@playwright/test";
import { fixture } from "./sheets-fixture";
export async function mockGoogle(page: Page) {
  const f = fixture();
  const state = {
    signIns: 0,
    sheetRequests: 0,
    publicRequests: 0,
    failReads: false,
    failWrites: false,
    email: "ramasami.official@gmail.com",
  };
  await page.addInitScript(() => {
    localStorage.setItem("wealthtrack-save-destination", "browser");
    localStorage.setItem("financial-data", "stale data must never be used");
    indexedDB.open = () => {
      throw new Error("Financial IndexedDB access is forbidden");
    };
  });
  await page.route("https://docs.google.com/**", (route) => {
    state.publicRequests++;
    return route.abort();
  });
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{oauth2:{initTokenClient:function(c){return {requestAccessToken:function(){fetch('/test-signin-count');c.callback({access_token:'test-token',expires_in:3600,scope:'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'})}}}}}};`,
    }),
  );
  await page.route("**/test-signin-count", (route) => {
    state.signIns++;
    return route.fulfill({ body: "ok" });
  });
  await page.route("https://www.googleapis.com/oauth2/v3/userinfo", (route) =>
    route.fulfill({
      json: { email: state.email, email_verified: true, name: "Ram" },
    }),
  );
  await page.route("https://sheets.googleapis.com/**", async (route) => {
    state.sheetRequests++;
    const req = route.request();
    if (
      (state.failReads && req.method() === "GET") ||
      (state.failWrites && req.method() !== "GET")
    )
      return route.fulfill({
        status: 503,
        json: { error: { message: "Sheets unavailable for this test" } },
      });
    const response = await f.fetcher(req.url(), {
      method: req.method(),
      headers: { Authorization: req.headers()["authorization"] || "" },
      body: req.postData() || undefined,
    });
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  return { f, state };
}
