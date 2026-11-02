import { Page } from "@playwright/test";
import { fixture } from "./sheets-fixture";
export async function mockGoogle(page: Page) {
  const f = fixture();
  const state = {
    ranges: [] as string[][],
    signIns: 0,
    sheetRequests: 0,
    publicRequests: 0,
    failReads: false,
    failWrites: false,
    dropWriteResponse: false,
    sheetAccess: true,
    authReads: 0,
    email: "ramasami.official@gmail.com",
  };
  await page.addInitScript(() => {
    localStorage.setItem("wealthtrack-save-destination", "browser");
    localStorage.setItem("financial-data", "stale data must never be used");
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => {
      if (name !== "budget-tracker-sheet-cache-v1")
        throw new Error("The superseded financial store must not be used");
      return originalOpen(name, version);
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
    const req = route.request();
    const authRead =
      req.url().includes("values:batchGet") &&
      new URL(req.url()).searchParams.getAll("ranges").length === 1 &&
      new URL(req.url()).searchParams.get("ranges") ===
        "'App Settings'!A1:H10000";
    if (authRead) {
      state.authReads++;
      if (!state.sheetAccess)
        return route.fulfill({
          status: 403,
          json: { error: { message: "No Sheet access" } },
        });
    } else state.sheetRequests++;
    if (req.url().includes("values:batchGet"))
      state.ranges.push(new URL(req.url()).searchParams.getAll("ranges"));
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
    if (
      state.dropWriteResponse &&
      req.method() !== "GET" &&
      f.grids["Audit Log"].length > 1
    ) {
      state.dropWriteResponse = false;
      return route.abort("failed");
    }
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: await response.text(),
    });
  });
  await page.route("https://script.google.com/macros/s/**/exec", (route) => {
    if (route.request().postDataJSON().action === "scannerStatus")
      return route.fulfill({
        json: {
          ok: true,
          result: {
            configured: false,
            canConfigure: state.email === "ramasami.official@gmail.com",
            model: "gpt-4.1-mini",
          },
        },
      });
    return route.fulfill({
      status: 503,
      json: { ok: false, error: "No service mock installed for this action." },
    });
  });
  return { f, state };
}
