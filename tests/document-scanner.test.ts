import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { scanSchema } from "../lib/document-scanner";
const proposal = {
  date: "2026-11-02",
  description: "Sample receipt",
  amount: 123.45,
  type: "Expense",
  expenseMode: "Debit",
  kind: "purchase",
  tagId: "food",
  accountHint: null,
  toAccountHint: null,
  creditCardHint: null,
  currency: "INR",
  confidence: "high",
  sourceIndex: 0,
  notes: "",
};
function scanner(configured = true, status = 200) {
  const props = new Map<string, string>(
    configured ? [["OPENAI_API_KEY", "server-test-key"]] : [],
  );
  const calls: any[] = [];
  const sandbox: any = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => props.get(key) || null,
        setProperty: (key: string, value: string) => props.set(key, value),
      }),
    },
    Utilities: {
      base64Decode: (data: string) => Array.from(Buffer.from(data, "base64")),
      formatDate: () => "2026-11-02",
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    UrlFetchApp: {
      fetch: (url: string, options: any) => {
        calls.push({ url, options });
        return {
          getResponseCode: () => status,
          getContentText: () =>
            JSON.stringify({
              status: "completed",
              output: [
                {
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify({
                        transactions: [proposal],
                        warnings: [],
                      }),
                    },
                  ],
                },
              ],
            }),
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("apps-script/Code.gs", "utf8"), sandbox);
  return { sandbox, calls, props };
}
const request = {
  files: [
    {
      name: "bill.pdf",
      mimeType: "application/pdf",
      data: "data:application/pdf;base64,JVBERi10ZXN0",
    },
  ],
  tags: [{ id: "food", name: "Food", type: "Expense" }],
};
test("AI scanner returns proposals with no Sheet writes and keeps the API key server-side", () => {
  const { sandbox, calls } = scanner();
  const result = sandbox.analyzeDocuments_(request, "authorized-owner");
  assert.equal(result.transactions[0].amount, 123.45);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(
    calls[0].options.headers.Authorization,
    "Bearer server-test-key",
  );
  const body = JSON.parse(calls[0].options.payload);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.ok(!JSON.stringify(result).includes("server-test-key"));
  assert.ok(!JSON.stringify(body).includes("authorized-owner"));
  assert.ok(!body.tools);
});
test("scanner fails clearly without a key, bounds requests and enforces daily limits", () => {
  assert.throws(
    () => scanner(false).sandbox.analyzeDocuments_(request, "owner"),
    /not configured/,
  );
  const { sandbox, props, calls } = scanner();
  assert.throws(
    () => sandbox.analyzeDocuments_({ ...request, files: [] }, "owner"),
    /Select/,
  );
  props.set("scan-count:2026-11-02:owner", "20");
  assert.throws(
    () => sandbox.analyzeDocuments_(request, "owner"),
    /Daily scan/,
  );
  assert.equal(calls.length, 0);
  assert.throws(
    () => scanner(true, 429).sandbox.analyzeDocuments_(request, "owner"),
    /HTTP 429/,
  );
});
test("malformed model output is rejected before it can enter a review", () => {
  assert.equal(
    scanSchema.parse({ transactions: [proposal], warnings: [] }).transactions
      .length,
    1,
  );
  assert.throws(() =>
    scanSchema.parse({
      transactions: [{ ...proposal, amount: -1 }],
      warnings: [],
    }),
  );
  assert.throws(() =>
    scanSchema.parse({
      transactions: [{ ...proposal, sourceIndex: 99 }],
      warnings: [],
    }),
  );
  assert.throws(() =>
    scanSchema.parse({
      transactions: [{ ...proposal, type: "Run code" }],
      warnings: [],
    }),
  );
});

test("scanner key configuration is owner-only, persists securely and never echoes a secret", () => {
  const { sandbox, props } = scanner(false);
  const secret = "sk-proj-synthetic-test-key-for-setup-only";
  assert.throws(
    () =>
      sandbox.configureScanner_({ apiKey: secret }, "tnvarsha.99@gmail.com"),
    /Only the service owner/,
  );
  assert.equal(props.has("OPENAI_API_KEY"), false);
  assert.throws(
    () =>
      sandbox.configureScanner_(
        { apiKey: "bad" },
        "ramasami.official@gmail.com",
      ),
    /valid OpenAI/,
  );
  const response = sandbox.configureScanner_(
    { apiKey: secret },
    "ramasami.official@gmail.com",
  );
  assert.equal(response.configured, true);
  assert.equal(props.get("OPENAI_API_KEY"), secret);
  assert.ok(!JSON.stringify(response).includes(secret));
  assert.throws(
    () =>
      sandbox.configureScanner_({ apiKey: "" }, "ramasami.official@gmail.com"),
    /valid OpenAI/,
  );
  assert.equal(props.get("OPENAI_API_KEY"), secret);
});
