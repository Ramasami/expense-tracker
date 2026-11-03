import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { hdfcPortfolioSchema, portfolioTotals } from "../lib/hdfc-portfolio";
const ram = "ram@example.test",
  varsha = "varsha@example.test";
function server() {
  const props = new Map<string, string>(),
    calls: any[] = [];
  let profile405 = false;
  let responseCode = 200,
    profileId = "TEST1234",
    beforeHoldings: undefined | (() => void);
  const sandbox: any = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => props.get(k) || null,
        setProperty: (k: string, v: string) => props.set(k, v),
        deleteProperty: (k: string) => props.delete(k),
      }),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    Utilities: { getUuid: () => crypto.randomUUID() },
    UrlFetchApp: {
      fetch: (url: string, options: any) => {
        calls.push({ url, options });
        let data;
        if (url.includes("/access-token?"))
          data = { accessToken: "synthetic-server-token" };
        else if (url.includes("/user/profile?"))
          data = {
            status: "success",
            data: [{ user_id: profileId, bank_details: { private: true } }],
          };
        else if (url.includes("/portfolio/holdings?")) {
          beforeHoldings?.();
          data = {
            status: "success",
            data: [
              {
                company_name: "Example Industries",
                isin: "SYNTHETIC001",
                exchange: "NSE",
                sector_name: "Industry",
                quantity: "2",
                average_price: "40.67",
                investment_value: "",
                close_price: 42.28,
              },
            ],
          };
        } else throw Error("Unexpected upstream URL");
        return {
          getResponseCode: () =>
            profile405 &&
            url.includes("/user/profile?") &&
            options.method === "get"
              ? 405
              : responseCode,
          getContentText: () => JSON.stringify(data),
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), sandbox);
  return {
    props,
    calls,
    profile405: () => (profile405 = true),
    sandbox,
    dispatch: (req: any, actor = ram) => sandbox.hdfcDispatch_(req, actor),
    code: (n: number) => (responseCode = n),
    profile: (id: string) => (profileId = id),
    beforeHoldings: (f: () => void) => (beforeHoldings = f),
  };
}
function configure(s: ReturnType<typeof server>, actor = ram) {
  return s.dispatch(
    {
      action: "configureHDFC",
      apiKey: "synthetic-api-key",
      apiSecret: "synthetic-api-secret",
      clientId: "TEST1234",
    },
    actor,
  );
}
function connect(s: ReturnType<typeof server>) {
  configure(s);
  const f = s.dispatch({ action: "beginHDFC" });
  return s.dispatch({
    action: "completeHDFC",
    flowId: f.flowId,
    requestToken: "synthetic-request-token",
    confirmed: true,
  });
}
test("HDFC connection is private to each verified actor and never returns broker secrets", () => {
  const s = server();
  configure(s);
  assert.equal(s.dispatch({ action: "hdfcStatus" }).configured, true);
  assert.equal(s.dispatch({ action: "hdfcStatus" }, varsha).configured, false);
  const flow = s.dispatch({ action: "beginHDFC" });
  const serialized = JSON.stringify(
    [...s.props.values()].map((v) => JSON.parse(v)),
  );
  assert.ok(serialized.includes("synthetic-api-secret"));
  assert.ok(!s.props.get("HDFC_FLOW:" + ram)!.includes("synthetic-api-secret"));
  assert.throws(
    () =>
      s.dispatch(
        {
          action: "completeHDFC",
          flowId: flow.flowId,
          requestToken: "synthetic",
          confirmed: true,
        },
        varsha,
      ),
    /credentials/,
  );
  const output = s.dispatch({
    action: "completeHDFC",
    flowId: flow.flowId,
    requestToken: "synthetic",
    confirmed: true,
  });
  assert.equal(output.connected, true);
  assert.ok(!JSON.stringify(output).includes("synthetic"));
  const calls = s.calls.length;
  s.dispatch({
    action: "completeHDFC",
    flowId: flow.flowId,
    requestToken: "synthetic",
    confirmed: true,
  });
  assert.equal(s.calls.length, calls);
  assert.equal(s.calls[0].options.method, "post");
  assert.equal(
    JSON.parse(s.calls[0].options.payload).apiSecret,
    "synthetic-api-secret",
  );
  assert.ok(
    s.calls.every(
      (c) =>
        c.url.startsWith("https://developer.hdfcsec.com/oapi/") &&
        !c.url.includes("/orders"),
    ),
  );
});
test("HDFC broker identity, expiring one-time flow and setup races are enforced", () => {
  const s = server();
  configure(s);
  const f = s.dispatch({ action: "beginHDFC" });
  assert.throws(
    () =>
      s.dispatch({
        action: "completeHDFC",
        flowId: f.flowId,
        requestToken: "a",
      }),
    /Confirm/,
  );
  assert.equal(s.calls.length, 0);
  s.profile("OTHER");
  assert.throws(
    () =>
      s.dispatch({
        action: "completeHDFC",
        flowId: f.flowId,
        requestToken: "a",
        confirmed: true,
      }),
    /does not match/,
  );
  assert.equal(s.dispatch({ action: "hdfcStatus" }).connected, false);
  assert.throws(
    () =>
      s.dispatch({
        action: "completeHDFC",
        flowId: f.flowId,
        requestToken: "a",
        confirmed: true,
      }),
    /already/,
  );
  const newFlow = s.dispatch({ action: "beginHDFC" });
  s.props.set(
    "HDFC_FLOW:" + ram,
    JSON.stringify({ id: newFlow.flowId, expires: Date.now() - 1 }),
  );
  assert.throws(
    () =>
      s.dispatch({
        action: "completeHDFC",
        flowId: newFlow.flowId,
        requestToken: "a",
        confirmed: true,
      }),
    /expired/,
  );
  const latest = s.dispatch({ action: "beginHDFC" });
  configure(s);
  assert.throws(
    () =>
      s.dispatch({
        action: "completeHDFC",
        flowId: latest.flowId,
        requestToken: "a",
        confirmed: true,
      }),
    /expired/,
  );
});
test("holdings use closing prices and exact cost fallback; missing prices stay unknown", () => {
  const s = server();
  connect(s);
  const result = hdfcPortfolioSchema.parse(
    s.dispatch({ action: "hdfcPortfolio" }),
  );
  assert.equal(result.holdings[0].investedValue, 81.34);
  assert.equal(result.holdings[0].closingValue, 84.56);
  assert.equal(result.holdings[0].unrealized, 3.22);
  assert.equal(portfolioTotals(result.holdings).value, 84.56);
  assert.ok(!JSON.stringify(result).includes("server-token"));
  const missing = s.sandbox.hdfcHoldings_([
    { quantity: 2, average_price: 10, close_price: "" },
  ]);
  assert.equal(missing[0].closingValue, null);
  assert.equal(portfolioTotals(missing).partialValue, true);
  assert.throws(
    () => s.sandbox.hdfcHoldings_([{ quantity: "not a number" }]),
    /invalid/,
  );
  assert.throws(() => s.sandbox.hdfcHoldings_([{ quantity: -1 }]), /invalid/);
  assert.throws(
    () => s.sandbox.hdfcHoldings_([{ quantity: 1, close_price: "42 junk" }]),
    /invalid/,
  );
});
test("disconnect removes credentials, hides data and cannot be undone by an in-flight fetch", () => {
  const s = server();
  connect(s);
  s.beforeHoldings(() =>
    s.dispatch({ action: "disconnectHDFC", confirmed: true }),
  );
  assert.throws(() => s.dispatch({ action: "hdfcPortfolio" }), /changed/);
  assert.equal(s.dispatch({ action: "hdfcStatus" }).connected, false);
  assert.equal(s.props.size, 0);
  assert.equal(s.dispatch({ action: "hdfcPortfolio" }).fetchedAt, null);
  assert.throws(() => s.dispatch({ action: "disconnectHDFC" }), /Confirm/);
});
test("upstream failures are sanitized with no auto-retry or stale fallback", () => {
  for (const code of [401, 403, 429, 503]) {
    const s = server();
    connect(s);
    s.code(code);
    const n = s.calls.length;
    assert.throws(() => s.dispatch({ action: "hdfcPortfolio" }), /HDFC/);
    assert.equal(s.calls.length, n + 1);
  }
  const s = server();
  assert.throws(
    () =>
      s.dispatch({
        action: "configureHDFC",
        apiKey: "bad\nkey",
        apiSecret: "secret",
        clientId: "id",
      }),
    /valid/,
  );
  assert.equal(s.props.size, 0);
});

test("profile identity check tries documented POST only after GET 405", () => {
  const s = server();
  s.profile405();
  connect(s);
  const profile = s.calls.filter((c) => c.url.includes("/user/profile?"));
  assert.deepEqual(
    profile.map((c) => c.options.method),
    ["get", "post"],
  );
  assert.equal(s.dispatch({ action: "hdfcStatus" }).connected, true);
});
test("expired HDFC tokens are removed while reusable app credentials remain", () => {
  const s = server();
  connect(s);
  s.code(401);
  assert.throws(() => s.dispatch({ action: "hdfcPortfolio" }), /expired/);
  const status = s.dispatch({ action: "hdfcStatus" });
  assert.equal(status.configured, true);
  assert.equal(status.connected, false);
  assert.ok(!s.props.get("HDFC_CONNECTION:" + ram)!.includes("server-token"));
});

test("pending HDFC login can be resumed only by the same actor while unexpired and unconsumed", () => {
  const s = server();
  configure(s);
  const f = s.dispatch({ action: "beginHDFC" });
  assert.equal(s.dispatch({ action: "pendingHDFC" }).flowId, f.flowId);
  assert.equal(s.dispatch({ action: "pendingHDFC" }, varsha).flowId, null);
  const raw = JSON.parse(s.props.get("HDFC_FLOW:" + ram)!);
  s.props.set(
    "HDFC_FLOW:" + ram,
    JSON.stringify({ ...raw, expires: Date.now() - 1 }),
  );
  assert.equal(s.dispatch({ action: "pendingHDFC" }).flowId, null);
  const next = s.dispatch({ action: "beginHDFC" });
  s.dispatch({
    action: "completeHDFC",
    requestToken: "synthetic",
    flowId: next.flowId,
    confirmed: true,
  });
  assert.equal(s.dispatch({ action: "pendingHDFC" }).flowId, null);
});
